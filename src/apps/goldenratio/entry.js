// What each key on the number pad does to the text being typed. Pure, so it is tested directly.
// replace: true right after you tap a result to type over it, so the first key starts fresh.

export const QUICK_FRACTIONS = [[1, 8], [1, 4], [3, 8], [1, 2], [5, 8], [3, 4], [7, 8]];
const MAX_LEN = 24;

const lastChar = (t) => t.slice(-1);
const isDigit = (c) => c >= "0" && c <= "9";
// the part being typed now (after the feet mark, after the last space)
const currentToken = (t) => t.split("'").pop().split(" ").pop();

export function applyKey(text, replace, key) {
  let t = replace ? "" : text;
  if (key === "back") return replace ? "" : text.slice(0, -1);
  if (key === "clear") return "";
  if (t.length >= MAX_LEN) return text;
  if (/^[0-9]$/.test(key)) return t + key;
  if (key === ".") {
    const tok = currentToken(t);
    if (tok.includes(".") || tok.includes("/")) return t;
    return t + (tok === "" ? "0." : ".");
  }
  if (key === "/") {
    const tok = currentToken(t);
    if (!isDigit(lastChar(t)) || tok.includes("/") || tok.includes(".")) return t;
    return t + "/";
  }
  if (key === "space") {
    if (!isDigit(lastChar(t)) || currentToken(t).includes("/")) return t;
    return t + " ";
  }
  if (key === "feet") {
    if (t.includes("'") || !isDigit(lastChar(t))) return t;
    return t + "' "; // the space keeps it readable: 5' 3 1/2
  }
  if (Array.isArray(key)) { // a quick fraction [num, den]: replaces a fraction already at the end
    const f = `${key[0]}/${key[1]}`;
    let base = t.replace(/\s*\d+\/\d*$/, "");
    if (base === "" || lastChar(base) === " ") return base + f;
    if (lastChar(base) === "'") return base + " " + f;
    if (base.endsWith("' ")) return base + f;
    if (isDigit(lastChar(base)) && !currentToken(base).includes(".")) return base + " " + f;
    return t;
  }
  return t;
}
