const assert = require('assert');
const vscode = require('vscode');

const packageJson = require('../package.json');

const EXTENSION_LOOKUP_IDS = [
    `${packageJson.publisher}.${packageJson.name}`,
    `${String(packageJson.publisher).toLowerCase()}.${packageJson.name}`
];

function getExtension() {
    for (const extensionId of EXTENSION_LOOKUP_IDS) {
        const extension = vscode.extensions.getExtension(extensionId);
        if (extension) {
            return extension;
        }
    }

    assert.fail(`Extension should be installed under one of: ${EXTENSION_LOOKUP_IDS.join(', ')}`);
}

async function setBrowseMode(mode) {
    return vscode.commands.executeCommand('markdown-compass.__test.setBrowseMode', mode);
}

async function getBrowseTreeSnapshot(depth = 1) {
    return vscode.commands.executeCommand('markdown-compass.__test.getBrowseTreeSnapshot', { depth });
}

async function stripEmojiTreeLabel(label) {
    return vscode.commands.executeCommand('markdown-compass.__test.stripEmojiTreeLabel', label);
}

describe('Browse Mode Smoke Tests', function() {
    this.timeout(60000);

    before(async function() {
        const extension = getExtension();
        const expectedExtensionId = `${extension.packageJSON.publisher}.${extension.packageJSON.name}`;
        assert.strictEqual(extension.id, expectedExtensionId, 'Extension identifier should match the published package');

        if (!extension.isActive) {
            await extension.activate();
        } else {
            await extension.activate();
        }

        assert.ok(extension.isActive, 'Extension should be active before browse-mode smoke checks');
    });

    afterEach(async function() {
        await setBrowseMode('tree');
        await vscode.commands.executeCommand('markdown-compass.clearSearch');
    });

    it('declares the browse-mode command and configuration surface', async function() {
        const extension = getExtension();
        const declaredCommands = extension.packageJSON.contributes.commands.map(command => command.command);
        const configurationProperties = extension.packageJSON.contributes.configuration?.properties ?? {};
        const commands = await vscode.commands.getCommands(true);

        assert.ok(
            declaredCommands.includes('markdown-compass.toggleBrowseMode'),
            'Browse mode toggle command should be declared in package.json'
        );
        assert.ok(
            commands.includes('markdown-compass.toggleBrowseMode'),
            'Browse mode toggle command should be registered'
        );
        assert.ok(
            commands.includes('markdown-compass.__test.setBrowseMode'),
            'Browse mode test helper command should be registered'
        );
        assert.ok(
            commands.includes('markdown-compass.__test.getBrowseTreeSnapshot'),
            'Browse tree snapshot test helper command should be registered'
        );
        assert.ok(
            configurationProperties['markdownCompass.browseMode'],
            'Browse mode configuration should be declared'
        );
    });

    it('can organize Markdown files into document categories', async function() {
        await setBrowseMode('category');
        const snapshot = await getBrowseTreeSnapshot(1);

        assert.strictEqual(snapshot.browseMode, 'category', 'Browse mode should switch to category');
        assert.ok(snapshot.rootItems.length > 0, 'Category mode should expose category buckets at the root');
        assert.ok(snapshot.rootItems.length >= 3, 'Category mode should expose multiple category buckets in this workspace');

        const rootLabels = snapshot.rootItems.map(item => item.label);
        assert.ok(rootLabels.includes('README'), 'Category mode should expose a README bucket');
        assert.ok(rootLabels.includes('Tests & Examples'), 'Category mode should expose a Tests & Examples bucket');
        assert.ok(rootLabels.includes('Other Markdown'), 'Category mode should expose a fallback category bucket');

        const readmeBucket = snapshot.rootItems.find(item => item.label === 'README');
        assert.ok(Array.isArray(readmeBucket.children), 'Category snapshot should include bucket children');
        assert.ok(
            readmeBucket.children.some(child => child.label === 'README.md'),
            'README bucket should include the workspace README markdown file'
        );
    });

    it('strips emoji from rendered tree labels while preserving readable text', async function() {
        const sanitized = await stripEmojiTreeLabel('🚀 Launch Checklist ✅');
        const sanitizedFamily = await stripEmojiTreeLabel('Docs 👨‍👩‍👧‍👦 Overview');
        const sanitizedFlag = await stripEmojiTreeLabel('Status 🇺🇸 Notes');

        assert.strictEqual(sanitized, 'Launch Checklist', 'Emoji should be removed from rendered heading labels');
        assert.strictEqual(sanitizedFamily, 'Docs Overview', 'ZWJ emoji sequences should be removed cleanly');
        assert.strictEqual(sanitizedFlag, 'Status Notes', 'Flag emoji should be removed from rendered heading labels');
    });

    it('can return the root view to workspace tree mode', async function() {
        await setBrowseMode('tree');
        const snapshot = await getBrowseTreeSnapshot(0);
        const workspaceRootLabel = vscode.workspace.workspaceFolders?.[0]?.name;

        assert.strictEqual(snapshot.browseMode, 'tree', 'Browse mode should return to tree');
        assert.ok(
            snapshot.rootItems.some(item => item.type === 'directory' && item.label === workspaceRootLabel),
            'Tree mode should expose the workspace root directory at the top level'
        );
    });
});
