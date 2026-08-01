#!/usr/bin/env python3
"""Bounded LibreOffice UNO dispatcher for Material Office.

The Node main process supplies only values derived from the bundled command catalog.
This broker never reads document content and emits one compact JSON status object.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Any, Iterable


SCOPE_CONTEXTS = {
    "basic": ("basic",),
    "biblio": ("base",),
    "calc": ("calc",),
    "chart": ("chart",),
    "dbu": ("base",),
    "math": ("math",),
    "report": ("base",),
    "sd": ("impress", "draw"),
    "shared": ("writer", "calc", "impress", "draw", "base", "math"),
    "writer": ("writer",),
}

FACTORY_URLS = {
    "basic": "private:factory/sbasic",
    "writer": "private:factory/swriter",
    "calc": "private:factory/scalc",
    "impress": "private:factory/simpress",
    "draw": "private:factory/sdraw",
    "base": "private:factory/sdatabase",
    "math": "private:factory/smath",
    "chart": "private:factory/schart",
}

CONTEXT_SERVICES = {
    "basic": ("com.sun.star.script.BasicIDE",),
    "writer": ("com.sun.star.text.TextDocument",),
    "calc": ("com.sun.star.sheet.SpreadsheetDocument",),
    "impress": ("com.sun.star.presentation.PresentationDocument",),
    "draw": ("com.sun.star.drawing.DrawingDocument",),
    "base": ("com.sun.star.sdb.OfficeDatabaseDocument",),
    "math": ("com.sun.star.formula.FormulaProperties",),
    "chart": ("com.sun.star.chart2.ChartDocument",),
}

PIPE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,128}$")
UNO_COMMAND_PATTERN = re.compile(r"^\.uno:[^\x00-\x1f\x7f]{1,2043}$")
SCRIPT_URI_PATTERN = re.compile(
    r"(?:vnd\.sun\.star\.script|(?:^|[?&=])(?:macro|script|javascript):)",
    re.IGNORECASE,
)


class BrokerArgumentError(Exception):
    """Raised for arguments outside the fixed broker contract."""


class DispatchFailedError(Exception):
    """Raised when a frame accepts a command but dispatch itself fails."""


class QuietArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise BrokerArgumentError("invalid arguments")


def emit(payload: dict[str, Any]) -> None:
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > 2048:
        encoded = '{"ok":false,"error":{"code":"UNO_BROKER_FAILED"}}'
    sys.stdout.write(encoded + "\n")
    sys.stdout.flush()


def error_payload(code: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code}}


def parse_arguments(argv: list[str]) -> argparse.Namespace:
    parser = QuietArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument("--pipe-name", required=True)
    parser.add_argument("--command")
    parser.add_argument("--scope")
    parser.add_argument("--contexts")
    parser.add_argument("--verify-closed", action="store_true")
    parser.add_argument("--connect-timeout-ms", required=True, type=int)
    arguments = parser.parse_args(argv)

    if not PIPE_PATTERN.fullmatch(arguments.pipe_name):
        raise BrokerArgumentError("invalid pipe")
    if not 250 <= arguments.connect_timeout_ms <= 30_000:
        raise BrokerArgumentError("invalid timeout")
    if arguments.verify_closed:
        if any(
            value is not None
            for value in (arguments.command, arguments.scope, arguments.contexts)
        ):
            raise BrokerArgumentError("mixed modes")
        return arguments
    if any(
        value is None
        for value in (arguments.command, arguments.scope, arguments.contexts)
    ):
        raise BrokerArgumentError("missing command arguments")
    expected_contexts = SCOPE_CONTEXTS.get(arguments.scope)
    supplied_contexts = tuple(arguments.contexts.split(","))
    if expected_contexts is None or supplied_contexts != expected_contexts:
        raise BrokerArgumentError("unsupported scope")
    if (
        len(arguments.command) > 2048
        or not UNO_COMMAND_PATTERN.fullmatch(arguments.command)
        or SCRIPT_URI_PATTERN.search(arguments.command)
    ):
        raise BrokerArgumentError("invalid command")
    arguments.contexts = supplied_contexts
    return arguments


def connect_to_office(
    uno_module: Any,
    no_connect_exception: type[Exception],
    pipe_name: str,
    timeout_ms: int,
) -> Any:
    local_context = uno_module.getComponentContext()
    local_manager = local_context.ServiceManager
    resolver = local_manager.createInstanceWithContext(
        "com.sun.star.bridge.UnoUrlResolver", local_context
    )
    target = (
        f"uno:pipe,name={pipe_name};urp;"
        "StarOffice.ComponentContext"
    )
    deadline = time.monotonic() + (timeout_ms / 1000.0)
    while True:
        try:
            return resolver.resolve(target)
        except no_connect_exception:
            if time.monotonic() >= deadline:
                raise TimeoutError("UNO connection timed out")
            time.sleep(0.1)


def supports_service(component: Any, service_name: str) -> bool:
    try:
        return bool(component.supportsService(service_name))
    except Exception:
        return False


def component_matches(component: Any, context_name: str) -> bool:
    if component is None:
        return False
    if context_name == "draw" and supports_service(
        component, "com.sun.star.presentation.PresentationDocument"
    ):
        return False
    return any(
        supports_service(component, service_name)
        for service_name in CONTEXT_SERVICES[context_name]
    )


def component_frame(component: Any) -> Any:
    for _attempt in range(40):
        try:
            controller = component.getCurrentController()
            if controller is not None:
                frame = controller.getFrame()
                if frame is not None:
                    return frame
        except Exception:
            pass
        time.sleep(0.05)
    return None


def obtain_frame(desktop: Any, context_name: str) -> Any:
    try:
        current = desktop.getCurrentComponent()
    except Exception:
        current = None
    if component_matches(current, context_name):
        frame = component_frame(current)
        if frame is not None:
            return frame

    component = desktop.loadComponentFromURL(
        FACTORY_URLS[context_name], "_blank", 0, ()
    )
    if component is None:
        return None
    return component_frame(component)


def parsed_uno_url(uno_module: Any, service_manager: Any, context: Any, command: str) -> Any:
    transformer = service_manager.createInstanceWithContext(
        "com.sun.star.util.URLTransformer", context
    )
    if transformer is None:
        return None
    url = uno_module.createUnoStruct("com.sun.star.util.URL")
    url.Complete = command
    transformer.parseStrict(url)
    return url


def dispatch_command(
    uno_module: Any,
    remote_context: Any,
    contexts: Iterable[str],
    command: str,
) -> str | None:
    service_manager = remote_context.ServiceManager
    desktop = service_manager.createInstanceWithContext(
        "com.sun.star.frame.Desktop", remote_context
    )
    helper = service_manager.createInstanceWithContext(
        "com.sun.star.frame.DispatchHelper", remote_context
    )
    if desktop is None or helper is None:
        raise RuntimeError("UNO dispatch services unavailable")
    parsed_url = parsed_uno_url(
        uno_module, service_manager, remote_context, command
    )
    if parsed_url is None:
        raise RuntimeError("UNO URL transformer unavailable")

    provider_found = False
    for context_name in contexts:
        try:
            frame = obtain_frame(desktop, context_name)
            if frame is None:
                continue
            provider = frame.queryDispatch(parsed_url, "_self", 0)
            if provider is None:
                continue
            provider_found = True
            try:
                frame.getContainerWindow().setFocus()
            except Exception:
                pass
            helper.executeDispatch(frame, command, "", 0, ())
            return context_name
        except Exception:
            continue
    if provider_found:
        raise DispatchFailedError("UNO dispatch failed")
    return None


def main(argv: list[str]) -> int:
    try:
        arguments = parse_arguments(argv)
    except Exception:
        emit(error_payload("BROKER_INVALID_INPUT"))
        return 2

    try:
        import uno  # type: ignore[import-not-found]
        from com.sun.star.connection import NoConnectException  # type: ignore[import-not-found]
    except Exception:
        emit(error_payload("PYUNO_UNAVAILABLE"))
        return 3

    if arguments.verify_closed:
        try:
            connect_to_office(
                uno,
                NoConnectException,
                arguments.pipe_name,
                arguments.connect_timeout_ms,
            )
        except TimeoutError:
            emit({"ok": True, "status": "closed"})
            return 0
        except Exception:
            emit(error_payload("UNO_SERVICE_UNAVAILABLE"))
            return 5
        emit(error_payload("UNO_ACCEPTOR_OPEN"))
        return 8

    try:
        remote_context = connect_to_office(
            uno,
            NoConnectException,
            arguments.pipe_name,
            arguments.connect_timeout_ms,
        )
    except TimeoutError:
        emit(error_payload("UNO_CONNECTION_TIMEOUT"))
        return 4
    except Exception:
        emit(error_payload("UNO_SERVICE_UNAVAILABLE"))
        return 5

    try:
        context_name = dispatch_command(
            uno, remote_context, arguments.contexts, arguments.command
        )
    except DispatchFailedError:
        emit(error_payload("UNO_DISPATCH_FAILED"))
        return 7
    except Exception:
        emit(error_payload("UNO_SERVICE_UNAVAILABLE"))
        return 5
    if context_name is None:
        emit(error_payload("UNO_CONTEXT_UNAVAILABLE"))
        return 6

    emit({"ok": True, "status": "dispatched", "context": context_name})
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
