import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const IGNORED_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', '.next',
    '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'coverage'
]);

const MAX_FILE_SIZE = 100 * 1024; // 100KB
const MAX_FILES_IN_TREE = 100;

export function getCurrentFileContext(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }

    const doc = editor.document;
    const lang = doc.languageId;
    const fileName = path.basename(doc.fileName);
    const content = doc.getText();

    return `**File:** \`${fileName}\` (${lang})\n\`\`\`${lang}\n${content}\n\`\`\``;
}

export function getSelectionContext(): string | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return null; }

    const selection = editor.selection;
    const text = editor.document.getText(selection);
    if (!text.trim()) { return null; }

    const lang = editor.document.languageId;
    const fileName = path.basename(editor.document.fileName);

    return `**Selected code from:** \`${fileName}\`\n\`\`\`${lang}\n${text}\n\`\`\``;
}

export function getFolderStructure(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }

    const rootPath = folders[0].uri.fsPath;
    const rootName = path.basename(rootPath);
    let fileCount = 0;

    function buildTree(dirPath: string, prefix: string, depth: number): string {
        if (depth > 5 || fileCount > MAX_FILES_IN_TREE) { return ''; }

        let result = '';
        let entries: fs.Dirent[];

        try {
            entries = fs.readdirSync(dirPath, { withFileTypes: true });
        } catch { return ''; }

        const filtered = entries.filter(e => !IGNORED_DIRS.has(e.name) && !e.name.startsWith('.'));

        filtered.forEach((entry, index) => {
            if (fileCount > MAX_FILES_IN_TREE) { return; }
            const isLast = index === filtered.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const nextPrefix = prefix + (isLast ? '    ' : '│   ');

            result += `${prefix}${connector}${entry.name}\n`;
            fileCount++;

            if (entry.isDirectory()) {
                result += buildTree(path.join(dirPath, entry.name), nextPrefix, depth + 1);
            }
        });

        return result;
    }

    const tree = buildTree(rootPath, '', 0);
    return `**Project structure:** \`${rootName}/\`\n\`\`\`\n${rootName}/\n${tree}\`\`\``;
}

export function getProjectSummary(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }

    const rootPath = folders[0].uri.fsPath;
    const rootName = path.basename(rootPath);
    const parts: string[] = [`**Project:** \`${rootName}\``];

    // Check for package.json
    const pkgPath = path.join(rootPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            parts.push(`**Type:** Node.js/JavaScript Project`);
            if (pkg.description) { parts.push(`**Description:** ${pkg.description}`); }
            if (pkg.dependencies) {
                const deps = Object.keys(pkg.dependencies).slice(0, 10).join(', ');
                parts.push(`**Main dependencies:** ${deps}`);
            }
        } catch { /**/ }
    }

    // Check for requirements.txt
    if (fs.existsSync(path.join(rootPath, 'requirements.txt'))) {
        parts.push(`**Type:** Python Project`);
        try {
            const reqs = fs.readFileSync(path.join(rootPath, 'requirements.txt'), 'utf8')
                .split('\n').filter(l => l.trim()).slice(0, 10).join(', ');
            parts.push(`**Dependencies:** ${reqs}`);
        } catch { /**/ }
    }

    // Check for go.mod
    if (fs.existsSync(path.join(rootPath, 'go.mod'))) {
        parts.push(`**Type:** Go Project`);
    }

    // Check for Cargo.toml
    if (fs.existsSync(path.join(rootPath, 'Cargo.toml'))) {
        parts.push(`**Type:** Rust Project`);
    }

    // Count files by extension
    const extCounts: Record<string, number> = {};
    function countFiles(dir: string, depth: number) {
        if (depth > 3) { return; }
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (IGNORED_DIRS.has(entry.name)) { continue; }
                if (entry.isDirectory()) {
                    countFiles(path.join(dir, entry.name), depth + 1);
                } else {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (ext) { extCounts[ext] = (extCounts[ext] || 0) + 1; }
                }
            }
        } catch { /**/ }
    }
    countFiles(rootPath, 0);

    const topExts = Object.entries(extCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([ext, count]) => `${ext}(${count})`)
        .join(', ');
    if (topExts) { parts.push(`**File types:** ${topExts}`); }

    // Add folder structure
    const tree = getFolderStructure();
    if (tree) { parts.push(tree); }

    return parts.join('\n');
}
