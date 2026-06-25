import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ASSET_PATTERN =
  /<script\b([^>]*?)\bsrc=(["'])(\/?assets\/[^"']+\.js)\2([^>]*)>\s*<\/script>/g;
const STYLE_ASSET_PATTERN = /<link\b([^>]*?)\bhref=(["'])(\/?assets\/[^"']+\.css)\2([^>]*?)>/g;

function normalizeAssetPath(assetPath) {
  return assetPath.replace(/^\/+/, '').replaceAll('\\', '/');
}

function escapeInlineScript(source) {
  return source.replaceAll('</script', '<\\/script');
}

function escapeInlineStyle(source) {
  return source.replaceAll('</style', '<\\/style');
}

export function inlineBuiltAssets(html, { readAsset }) {
  const withStyles = html.replace(STYLE_ASSET_PATTERN, (match, beforeHref, quote, assetPath, afterHref) => {
    const relMarkup = `${beforeHref} ${afterHref}`;
    if (!/\brel=(["'])stylesheet\1/.test(relMarkup)) return match;

    const normalizedPath = normalizeAssetPath(assetPath);
    const css = escapeInlineStyle(readAsset(normalizedPath));
    return `<style data-standalone-asset="${normalizedPath}">\n${css}\n</style>`;
  });

  return withStyles.replace(SCRIPT_ASSET_PATTERN, (match, beforeSrc, quote, assetPath, afterSrc) => {
    const normalizedPath = normalizeAssetPath(assetPath);
    const js = escapeInlineScript(readAsset(normalizedPath));
    return `<script type="module" data-standalone-asset="${normalizedPath}">\n${js}\n</script>`;
  });
}

export function buildStandalone({
  distDir = path.resolve('dist'),
  inputFile = 'index.html',
  outputFile = 'gpt5.5-ocean-realistic-standalone.html'
} = {}) {
  const inputPath = path.join(distDir, inputFile);
  const html = readFileSync(inputPath, 'utf8');
  const standaloneHtml = inlineBuiltAssets(html, {
    readAsset(assetPath) {
      return readFileSync(path.join(distDir, assetPath), 'utf8');
    }
  });
  const outputPath = path.join(distDir, outputFile);
  writeFileSync(outputPath, standaloneHtml, 'utf8');
  return outputPath;
}

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const outputPath = buildStandalone();
  console.log(`Standalone HTML written to ${outputPath}`);
}
