export function discardDocumentChanges(state, tab) {
  if (!state || !Array.isArray(state.documents) || !tab?.documentId) {
    if (tab) tab.unsaved = false;
    return { removed: false, restored: false, documentId: tab?.documentId ?? null };
  }
  const documentRecord = state.documents.find((item) => item.id === tab.documentId);
  if (!documentRecord) {
    tab.unsaved = false;
    return { removed: false, restored: false, documentId: tab.documentId };
  }
  if (documentRecord.savedContent === null || documentRecord.savedContent === undefined) {
    state.documents = state.documents.filter((item) => item.id !== documentRecord.id);
    tab.unsaved = false;
    return { removed: true, restored: false, documentId: documentRecord.id };
  }
  documentRecord.content = structuredClone(documentRecord.savedContent);
  documentRecord.unsaved = false;
  tab.unsaved = false;
  return { removed: false, restored: true, documentId: documentRecord.id };
}
