export function computeCloseCandidateIds({ openIds, matchIndices, mode, pinnedIds, includePinned }) {
  if (mode !== "containing" && mode !== "not-containing") throw new Error("Unknown close mode.");
  const matches = new Set(matchIndices);
  const pinned = new Set(pinnedIds);
  return openIds.filter((id, index) => {
    const predicate = matches.has(index);
    const modeMatches = mode === "containing" ? predicate : !predicate;
    return modeMatches && (includePinned || !pinned.has(id));
  });
}

export function buildCloseReviewSignature({ mode, search, openIds, pinnedIds, includePinned, language }) {
  return JSON.stringify([
    mode,
    search.query,
    Boolean(search.regex),
    search.flags,
    openIds,
    pinnedIds,
    Boolean(includePinned),
    language,
  ]);
}
