// Phone vs tablet. Width-based, same 700px cut-off Shrexy used.
export function deviceType() {
  return window.innerWidth < 700 ? "phone" : "tablet";
}
