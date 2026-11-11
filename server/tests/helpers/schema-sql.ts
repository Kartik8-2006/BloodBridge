import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Turns prisma/schema.prisma into PostgreSQL DDL for the test database.
 * Real environments use `prisma db push`; this exists so the test suite does not need the schema engine.
 * It supports exactly the Prisma features this project uses.
 */
const SCALARS: Record<string, string> = {
  String: 'TEXT',
  Int: 'INTEGER',
  Float: 'DOUBLE PRECISION',
  Boolean: 'BOOLEAN',
  DateTime: 'TIMESTAMP(3)',
  Json: 'JSONB',
};

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  attrs: string;
}

export function schemaToSql(path = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url))): string {
  const src = readFileSync(path, 'utf8').replace(/\/\/\/?.*$/gm, '');
  const enums = new Map<string, string[]>();
  const models: { name: string; fields: Field[]; block: string[] }[] = [];
  // Line-based so braces inside attributes such as @default("{}") never end a block early.
  let current: { kind: 'enum' | 'model'; name: string } | null = null;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (!current) {
      const open = line.match(/^(enum|model)\s+(\w+)\s*\{$/);
      if (open) {
        current = { kind: open[1] as 'enum' | 'model', name: open[2]! };
        if (current.kind === 'enum') enums.set(current.name, []);
        else models.push({ name: current.name, fields: [], block: [] });
      }
      continue;
    }
    if (line === '}') {
      current = null;
      continue;
    }
    if (current.kind === 'enum') {
      enums.get(current.name)!.push(line);
      continue;
    }
    const model = models[models.length - 1]!;
    if (line.startsWith('@@')) {
      model.block.push(line);
      continue;
    }
    const f = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (f) model.fields.push({ name: f[1]!, type: f[2]!, list: !!f[3], optional: !!f[4], attrs: f[5] ?? '' });
  }
  const modelNames = new Set(models.map((m) => m.name));

  const out: string[] = [];
  for (const [name, values] of enums) out.push(`CREATE TYPE "${name}" AS ENUM (${values.map((v) => `'${v}'`).join(', ')});`);

  const post: string[] = [];
  for (const model of models) {
    const cols: string[] = [];
    const pk: string[] = [];
    for (const f of model.fields) {
      if (f.list || modelNames.has(f.type)) continue;
      const sqlType = SCALARS[f.type] ?? (enums.has(f.type) ? `"${f.type}"` : null);
      if (!sqlType) throw new Error(`Unsupported type ${f.type} on ${model.name}.${f.name}`);
      let col = `"${f.name}" ${sqlType}${f.optional ? '' : ' NOT NULL'}`;
      const def = f.attrs.match(/@default\((.*?)\)(?=\s*(?:@|$))/)?.[1];
      if (def === 'now()') col += ' DEFAULT CURRENT_TIMESTAMP';
      else if (def === 'true' || def === 'false') col += ` DEFAULT ${def}`;
      else if (def?.startsWith('"')) col += ` DEFAULT '${def.slice(1, -1)}'${f.type === 'Json' ? '::jsonb' : ''}`;
      else if (def && enums.has(f.type)) col += ` DEFAULT '${def}'`;
      cols.push(col);
      if (/@id\b/.test(f.attrs)) pk.push(`"${f.name}"`);
      if (/@unique\b/.test(f.attrs)) post.push(`CREATE UNIQUE INDEX "${model.name}_${f.name}_key" ON "${model.name}"("${f.name}");`);
    }
    out.push(`CREATE TABLE "${model.name}" (\n  ${[...cols, `PRIMARY KEY (${pk.join(', ')})`].join(',\n  ')}\n);`);
    for (const b of model.block) {
      const idx = b.match(/@@index\(\[([^\]]+)\]\)/);
      if (idx) {
        const names = idx[1]!.split(',').map((s) => s.trim());
        post.push(`CREATE INDEX "${model.name}_${names.join('_')}_idx" ON "${model.name}"(${names.map((n) => `"${n}"`).join(', ')});`);
      }
    }
    for (const f of model.fields) {
      const rel = f.attrs.match(/@relation\([^)]*fields:\s*\[(\w+)\][^)]*references:\s*\[(\w+)\](?:[^)]*onDelete:\s*(\w+))?/);
      if (!rel) continue;
      const action = { Cascade: 'CASCADE', SetNull: 'SET NULL', Restrict: 'RESTRICT' }[rel[3] ?? ''] ?? (f.optional ? 'SET NULL' : 'RESTRICT');
      post.push(`ALTER TABLE "${model.name}" ADD CONSTRAINT "${model.name}_${rel[1]}_fkey" FOREIGN KEY ("${rel[1]}") REFERENCES "${f.type}"("${rel[2]}") ON DELETE ${action} ON UPDATE CASCADE;`);
    }
  }
  return [...out, ...post].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(schemaToSql());
