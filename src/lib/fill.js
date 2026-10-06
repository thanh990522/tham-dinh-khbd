// Điền mặc định theo schema để dữ liệu luôn đủ trường (phòng khi phải dùng chế độ không ràng buộc schema).
export function fillBySchema(value, schema) {
  if (schema.type === 'object') {
    const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const out = {};
    for (const [k, s] of Object.entries(schema.properties)) out[k] = fillBySchema(v[k], s);
    return out;
  }
  if (schema.type === 'array') return Array.isArray(value) ? value.map((x) => fillBySchema(x, schema.items)) : [];
  if (schema.type === 'string') {
    if (schema.enum && !schema.enum.includes(value)) {
      return ['', 'khac'].find((d) => schema.enum.includes(d)) ?? schema.enum[0];
    }
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }
  if (schema.type === 'integer') return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  if (schema.type === 'boolean') return Boolean(value);
  return value;
}

