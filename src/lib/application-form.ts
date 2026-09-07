export type PositionFormValue = {
  title?: string;
};

export function buildPositionInput(positions: PositionFormValue[]) {
  return positions
    .map((position, index) => ({
      priority: index + 1,
      title: position.title?.trim() ?? "",
    }))
    .filter((position) => position.title.length > 0);
}
