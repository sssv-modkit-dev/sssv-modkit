/* Object palette: which object types can be added and how a new spawn record is built. Pure; no file access.
   A new record clones a stock record of the same type from any loaded level when one exists (so level-specific
   fields stay plausible); otherwise it is all zeros apart from type and pose. Offsets match EditorRecords. */
const LevelPalette = (() => {
  const SIZE = {props: 22, animals: 16}, YAW = {props: 10, animals: 8};
  const propTypes = () => Object.keys(LevelSelection.propNames).map(Number).filter(t => t !== 55).sort((a, b) => a - b);
  const animalTypes = () => LevelSelection.animalNames.map((_, type) => type);
  const initials = name => { const w = name.replace(/[()]/g, '').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); };
  const hue = type => (type * 47) % 360;
  function template(kind, type, stock) {
    for (const lists of Object.values(stock || {})) for (const hex of lists[kind] || []) if (parseInt(hex.slice(0, 4), 16) === type) return hex;
    return null;
  }
  function make(kind, type, pos, stock, yaw = 0) {
    if (!SIZE[kind] || !Number.isInteger(type) || type < 0 || type > (kind === 'props' ? 246 : 67)) throw Error('Unknown object type');
    if (kind === 'props' && type === 55) throw Error('A level has one player start; it cannot be added');
    const values = [pos[0], pos[1], pos[2], yaw].map(Math.round);
    if (values.some(v => v < -32768 || v > 32767)) throw Error('Position is outside the 16-bit coordinate range');
    const tpl = template(kind, type, stock), bytes = new Uint8Array(SIZE[kind]);
    if (tpl) tpl.match(/../g).forEach((h, i) => bytes[i] = parseInt(h, 16));
    const v = new DataView(bytes.buffer);
    v.setUint16(0, type); v.setInt16(2, values[0]); v.setInt16(4, values[1]); v.setInt16(6, values[2]); v.setInt16(YAW[kind], values[3]);
    return {hex: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''), templated: !!tpl};
  }
  return {propTypes, animalTypes, initials, hue, template, make, SIZE};
})();
if (typeof module !== 'undefined') module.exports = LevelPalette;
