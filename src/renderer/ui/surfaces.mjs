import { renderBase, renderCalc, renderDraw, renderImpress, renderMath, renderWriter } from './surfaces-documents.mjs';
import { renderChangelog, renderCommands, renderComponents, renderDialogs, renderHistory, renderHome, renderSettings } from './surfaces-tools.mjs';

export function renderSurface(surface, ctx) {
  switch (surface) {
    case 'writer': return renderWriter(ctx);
    case 'calc': return renderCalc(ctx);
    case 'impress': return renderImpress(ctx);
    case 'draw': return renderDraw(ctx);
    case 'base': return renderBase(ctx);
    case 'math': return renderMath(ctx);
    case 'components': return renderComponents(ctx);
    case 'commands': return renderCommands(ctx);
    case 'history': return renderHistory(ctx);
    case 'dialogs': return renderDialogs(ctx);
    case 'changelog': return renderChangelog(ctx);
    case 'settings': return renderSettings(ctx);
    default: return renderHome(ctx);
  }
}

