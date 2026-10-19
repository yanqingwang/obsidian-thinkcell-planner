import esbuild from 'esbuild';
import process from 'process';

const isProd = process.argv[2] === 'production';

const context = await esbuild.context({
    entryPoints: ['src/main.ts'],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    target: 'es2018',
    logLevel: 'info',
    sourcemap: isProd ? false : 'inline',
    treeShaking: true,
    outfile: 'main.js',
});

if (isProd) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
