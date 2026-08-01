function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function jsonEqual(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function findTab(state, tabId) {
  return Array.isArray(state?.tabs?.items)
    ? state.tabs.items.find((candidate) => candidate?.id === tabId) ?? null
    : null;
}

function findDocument(state, documentId) {
  return Array.isArray(state?.documents)
    ? state.documents.find((candidate) => candidate?.id === documentId) ?? null
    : null;
}

export function beginDocumentSave(state, tabId, updatedAt = new Date().toISOString()) {
  const tab = findTab(state, tabId);
  const documentRecord = tab?.documentId ? findDocument(state, tab.documentId) : null;
  if (!tab || !documentRecord) return null;

  const transaction = Object.freeze({
    tabId: tab.id,
    documentId: documentRecord.id,
    previousSavedContent: clone(documentRecord.savedContent),
    previousUpdatedAt: documentRecord.updatedAt,
    previousDocumentUnsaved: documentRecord.unsaved === true,
    previousTabUnsaved: tab.unsaved === true,
    attemptedSavedContent: clone(documentRecord.content),
    attemptedUpdatedAt: updatedAt
  });

  documentRecord.savedContent = clone(documentRecord.content);
  documentRecord.unsaved = false;
  documentRecord.updatedAt = updatedAt;
  tab.unsaved = false;
  return transaction;
}

export function resolveDocumentSaveTarget(state, transaction) {
  if (!transaction?.tabId || !transaction?.documentId) {
    return { tab: null, documentRecord: null };
  }
  const tab = findTab(state, transaction.tabId);
  const documentRecord = findDocument(state, transaction.documentId);
  return {
    tab: tab?.documentId === transaction.documentId ? tab : null,
    documentRecord
  };
}

export function rollbackDocumentSave(state, transaction) {
  const target = resolveDocumentSaveTarget(state, transaction);
  const ownsOptimisticDocumentState = Boolean(
    target.documentRecord &&
    target.documentRecord.unsaved === false &&
    target.documentRecord.updatedAt === transaction.attemptedUpdatedAt &&
    jsonEqual(target.documentRecord.savedContent, transaction.attemptedSavedContent)
  );
  if (ownsOptimisticDocumentState) {
    target.documentRecord.savedContent = clone(transaction.previousSavedContent);
    target.documentRecord.updatedAt = transaction.previousUpdatedAt;
    target.documentRecord.unsaved = transaction.previousDocumentUnsaved;
  }
  if (ownsOptimisticDocumentState && target.tab) {
    target.tab.unsaved = transaction.previousTabUnsaved;
  }
  return {
    documentRestored: ownsOptimisticDocumentState,
    tabRestored: ownsOptimisticDocumentState && Boolean(target.tab)
  };
}
