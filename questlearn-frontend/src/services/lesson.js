/** The empty lesson a new node starts with. */
export const EMPTY_LESSON = { sections: [], keyTakeaways: [] };

/**
 * Turns a lesson draft from the editor into the object the API stores, dropping
 * the blank rows a teacher left behind and any key that ended up empty. Null
 * means "this node has no lesson text yet".
 */
export const lessonPayload = (draft) => {
  const rest = { ...(draft ?? {}) };
  delete rest.sections;
  delete rest.keyTakeaways;

  const sections = (draft?.sections ?? [])
    .map((section) => ({
      heading: (section?.heading ?? '').trim(),
      body: (section?.body ?? '').trim(),
    }))
    .filter((section) => section.heading || section.body);
  const keyTakeaways = (draft?.keyTakeaways ?? [])
    .map((takeaway) => String(takeaway ?? '').trim())
    .filter(Boolean);

  const payload = { ...rest };
  if (sections.length > 0) payload.sections = sections;
  if (keyTakeaways.length > 0) payload.keyTakeaways = keyTakeaways;
  return Object.keys(payload).length > 0 ? payload : null;
};
