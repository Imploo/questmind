#!/usr/bin/env node
/**
 * Fails when a component template holds text that is not translated.
 *
 * Every text the user sees comes from the translations (`'key' | translate`,
 * or a signal in the component) or, for D&D game terms, from `dnd-terms.ts`.
 * This script reads every template under `src/app` and reports what is still
 * written out: text between tags, visible attributes (placeholder, title,
 * aria-label, alt, ...) and string literals in the expressions that feed them.
 *
 * A text that is the same in every language (a brand name, say) is marked
 * with `data-no-i18n` on its element.
 *
 * Usage:
 *   node scripts/check-hardcoded-text.mjs            check the folders in ENFORCED
 *   node scripts/check-hardcoded-text.mjs src/app/x  check the given files or folders
 *
 * Text built in TypeScript (toasts, error signals) is out of its reach; that
 * stays a matter for review.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  Binary,
  BindingPipe,
  Conditional,
  Interpolation,
  LiteralPrimitive,
  ParenthesizedExpression,
  TemplateLiteral,
  TmplAstBoundAttribute,
  TmplAstBoundText,
  TmplAstElement,
  TmplAstText,
  TmplAstTextAttribute,
  parseTemplate,
} from '@angular/compiler';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** Checked on every `npm run lint`. */
const ENFORCED = [
  'src/app/app.html',
  'src/app/app-shell.component.ts',
  'src/app/loading.component.ts',
  'src/app/auth',
  'src/app/layout',
  'src/app/shared/components/language-switcher.component.ts',
  'src/app/shared/components/toast-container',
];

/** Left alone: the admin screen is English only, by decision (ticket #72). */
const EXCLUDED = ['src/app/admin/'];

/** Attributes whose value a user sees or hears. */
const VISIBLE_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
]);

const IGNORE_MARK = 'data-no-i18n';
const HAS_LETTER = /\p{L}/u;

/** Operators whose operands end up in the result as they are. */
const VALUE_OPERATORS = new Set(['+', '||', '??', '&&']);

function sourceFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return [path];
  return readdirSync(path).flatMap(name => sourceFiles(join(path, name)));
}

/** The inline templates of a TypeScript file, each with the line it starts on. */
function inlineTemplates(file, source) {
  const templates = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(tree) === 'template' &&
      (ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isStringLiteral(node.initializer))
    ) {
      const start = node.initializer.getStart(tree) + 1;
      templates.push({ text: node.initializer.text, line: tree.getLineAndCharacterOfPosition(start).line });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return templates;
}

function findProblems(template) {
  const problems = [];
  const report = (span, kind, text) =>
    problems.push({ line: span.start.line, kind, text: text.trim().replace(/\s+/g, ' ') });

  /** String literals that reach the user through an expression. */
  const checkExpression = (ast, span, kind) => {
    if (!ast) return;
    if (ast instanceof LiteralPrimitive) {
      if (typeof ast.value === 'string' && HAS_LETTER.test(ast.value)) report(span, kind, ast.value);
    } else if (ast instanceof Interpolation) {
      for (const text of ast.strings) if (HAS_LETTER.test(text)) report(span, kind, text);
      for (const expression of ast.expressions) checkExpression(expression, span, kind);
    } else if (ast instanceof Conditional) {
      checkExpression(ast.trueExp, span, kind);
      checkExpression(ast.falseExp, span, kind);
    } else if (ast instanceof Binary) {
      if (!VALUE_OPERATORS.has(ast.operation)) return;
      if (ast.operation !== '&&') checkExpression(ast.left, span, kind);
      checkExpression(ast.right, span, kind);
    } else if (ast instanceof BindingPipe) {
      // The input of `translate` is a key, not a text.
      if (ast.name !== 'translate') checkExpression(ast.exp, span, kind);
    } else if (ast instanceof ParenthesizedExpression) {
      checkExpression(ast.expression, span, kind);
    } else if (ast instanceof TemplateLiteral) {
      for (const element of ast.elements) if (HAS_LETTER.test(element.text)) report(span, kind, element.text);
      for (const expression of ast.expressions) checkExpression(expression, span, kind);
    }
  };

  const seen = new WeakSet();
  const visit = node => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }

    if (node instanceof TmplAstText) {
      if (HAS_LETTER.test(node.value)) report(node.sourceSpan, 'text', node.value);
      return;
    }
    if (node instanceof TmplAstBoundText) {
      checkExpression(node.value?.ast, node.sourceSpan, 'text');
      return;
    }

    const attributes = Array.isArray(node.attributes) ? node.attributes : [];
    if (attributes.some(attribute => attribute.name === IGNORE_MARK)) return;

    const isAppElement = node instanceof TmplAstElement && node.name.startsWith('app-');
    for (const attribute of attributes) {
      if (!(attribute instanceof TmplAstTextAttribute) || !HAS_LETTER.test(attribute.value)) continue;
      const visible = VISIBLE_ATTRIBUTES.has(attribute.name);
      // On our own components any input can be a text; a value of several words is one.
      const sentence = isAppElement && /\s/.test(attribute.value.trim()) && !['class', 'style'].includes(attribute.name);
      if (visible || sentence) report(attribute.sourceSpan, attribute.name, attribute.value);
    }
    for (const input of Array.isArray(node.inputs) ? node.inputs : []) {
      if (input instanceof TmplAstBoundAttribute && VISIBLE_ATTRIBUTES.has(input.name)) {
        checkExpression(input.value?.ast, input.sourceSpan, input.name);
      }
    }

    // Children live under different names per node (children, branches, cases, empty, ...).
    for (const [key, value] of Object.entries(node)) {
      if (key.endsWith('Span') || key === 'i18n' || key === 'attributes' || key === 'inputs' || key === 'outputs') continue;
      if (value && typeof value === 'object') visit(value);
    }
  };

  const parsed = parseTemplate(template, 'template.html', { preserveWhitespaces: false });
  visit(parsed.nodes);
  return problems;
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ENFORCED;
const files = targets
  .flatMap(target => sourceFiles(resolve(ROOT, target)))
  .filter(file => (file.endsWith('.ts') && !file.endsWith('.spec.ts')) || file.endsWith('.html'))
  .filter(file => !EXCLUDED.some(excluded => relative(ROOT, file).startsWith(excluded)));

let count = 0;
for (const file of files.sort()) {
  const source = readFileSync(file, 'utf8');
  const templates = file.endsWith('.html') ? [{ text: source, line: 0 }] : inlineTemplates(file, source);
  for (const template of templates) {
    for (const problem of findProblems(template.text)) {
      count++;
      console.log(`${relative(ROOT, file)}:${template.line + problem.line + 1}  ${problem.kind}: "${problem.text}"`);
    }
  }
}

if (count > 0) {
  console.log(
    `\n${count} hardcoded text${count === 1 ? '' : 's'} in templates. ` +
      'Use a translation key (`| translate`), a game term from dnd-terms.ts, or mark text that is the same in every language with data-no-i18n.',
  );
  process.exit(1);
}
console.log(`No hardcoded text in ${files.length} files.`);
