// Parses a JS object literal (unquoted keys, quoted strings, numbers, booleans)
// into plain data *without executing it*. Used to read data embedded in other
// sites' bundles safely.
const ESCAPES = { n: '\n', t: '\t', r: '\r' };

module.exports = function parseLiteral(src, start) {
  let i = start;
  const ws = () => { while (/\s/.test(src[i])) i++; };

  function str() {
    const q = src[i++];
    let out = '';
    while (src[i] !== q) {
      if (src[i] === '\\') {
        const n = src[++i];
        out += ESCAPES[n] !== undefined ? ESCAPES[n] : n;
        i++;
      } else out += src[i++];
    }
    i++;
    return out;
  }

  function value() {
    ws();
    const c = src[i];
    if (c === '{') {
      i++;
      const o = {};
      for (;;) {
        ws();
        if (src[i] === '}') { i++; return o; }
        let key;
        if (src[i] === '"' || src[i] === "'") key = str();
        else {
          const m = /^[\w$]+/.exec(src.slice(i, i + 200));
          if (!m) throw new Error(`bad key at ${i}`);
          key = m[0];
          i += key.length;
        }
        ws();
        if (src[i++] !== ':') throw new Error(`expected : at ${i}`);
        o[key] = value();
        ws();
        if (src[i] === ',') i++;
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      for (;;) {
        ws();
        if (src[i] === ']') { i++; return a; }
        a.push(value());
        ws();
        if (src[i] === ',') i++;
      }
    }
    if (c === '"' || c === "'") return str();
    const m = /^(-?\d+(\.\d+)?|!0|!1|true|false|null|void 0)/.exec(src.slice(i, i + 20));
    if (!m) throw new Error(`unsupported value at ${i}: ${src.slice(i, i + 30)}`);
    i += m[0].length;
    const lit = { '!0': true, '!1': false, true: true, false: false, null: null, 'void 0': null };
    return m[0] in lit ? lit[m[0]] : Number(m[0]);
  }

  return { value: value(), end: i };
};
