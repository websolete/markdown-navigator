// @ts-nocheck
export {};
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const path = require('path');
const ignore = require('ignore');
const FavoritesTreeDataProviderModule = require('../providers/favorites-provider');
const FavoritesTreeDataProvider = FavoritesTreeDataProviderModule.default || FavoritesTreeDataProviderModule;
const previewRouting = require('../services/preview-routing');
const { getSafePreviewRenderDebugState } = require('../services/markdown-safe-preview-plugin');
const { getExtensionAssetPath } = require('../utils/extension-assets');

const MARKDOWN_BROWSE_MODES = Object.freeze({
    TREE: 'tree',
    CATEGORY: 'category'
});

const FILE_TYPE_TO_BROWSE_CATEGORY_KEY = Object.freeze({
    'readme-exact': 'readme',
    readme: 'readme',
    'changelog-exact': 'changelog',
    changelog: 'changelog',
    'history-exact': 'history',
    history: 'history',
    'license-exact': 'license',
    license: 'license',
    analysis: 'analysis',
    docs: 'docs',
    tutorial: 'tutorial',
    api: 'api',
    spec: 'spec',
    test: 'test',
    notes: 'notes',
    todo: 'todo',
    default: 'default'
});

const BROWSE_CATEGORY_METADATA = Object.freeze({
    readme: { label: 'README', icon: 'readme.svg' },
    changelog: { label: 'Changelog', icon: 'changelog.svg' },
    history: { label: 'History', icon: 'history.svg' },
    license: { label: 'License', icon: 'license.svg' },
    analysis: { label: 'Analysis', icon: 'analysis.svg' },
    docs: { label: 'Docs & Guides', icon: 'docs.svg' },
    tutorial: { label: 'Tutorials', icon: 'tutorial.svg' },
    api: { label: 'API & Reference', icon: 'api.svg' },
    spec: { label: 'Specs & Requirements', icon: 'spec.svg' },
    test: { label: 'Tests & Examples', icon: 'test.svg' },
    notes: { label: 'Notes & Drafts', icon: 'notes.svg' },
    todo: { label: 'Todo & Tasks', icon: 'todo.svg' },
    default: { label: 'Other Markdown', icon: 'default.svg' }
});

const BROWSE_CATEGORY_ORDER = Object.freeze(Object.keys(BROWSE_CATEGORY_METADATA));

function normalizeBrowseMode(mode) {
    return mode === MARKDOWN_BROWSE_MODES.CATEGORY
        ? MARKDOWN_BROWSE_MODES.CATEGORY
        : MARKDOWN_BROWSE_MODES.TREE;
}

function getConfiguredBrowseMode() {
    return normalizeBrowseMode(
        vscode.workspace.getConfiguration('markdownCompass').get('browseMode')
    );
}

function getBrowseCategoryKey(fileType) {
    return FILE_TYPE_TO_BROWSE_CATEGORY_KEY[fileType] || 'default';
}

function getBrowseCategoryMetadata(categoryKey) {
    return BROWSE_CATEGORY_METADATA[categoryKey] || BROWSE_CATEGORY_METADATA.default;
}

function getBrowseCategoryIconPath(categoryKey) {
    return vscode.Uri.file(
        getExtensionAssetPath('icons', 'bullets', getBrowseCategoryMetadata(categoryKey).icon)
    );
}

function stripEmojiForTreeLabel(text) {
    if (!text) {
        return '';
    }

    return text
        .replace(/\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/gu, '')
        .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '')
        .replace(/[\u{1F3FB}-\u{1F3FF}\u200D\uFE0F\uFE0E\u20E3]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function serializePreviewRouteArg(arg) {
    if (arg && typeof arg === 'object' && typeof arg.toString === 'function' && Object.prototype.hasOwnProperty.call(arg, 'scheme')) {
        return arg.toString();
    }

    if (arg && arg.uri && typeof arg.uri.toString === 'function') {
        return {
            ...arg,
            uri: arg.uri.toString()
        };
    }

    return arg;
}

/**
 * Fuzzy search utility class for enhanced search capabilities
 */
class FuzzySearchUtils {
    /**
     * Calculate fuzzy match score between query and text
     * @param {string} query Search query
     * @param {string} text Text to search in
     * @returns {object|null} Match result with score and highlights, or null if no match
     */
    static fuzzyMatch(query, text) {
        if (!query || !text) return null;

        query = query.toLowerCase();
        text = text.toLowerCase();

        // Exact match gets highest score
        if (text.includes(query)) {
            const startIndex = text.indexOf(query);
            return {
                score: 100,
                highlights: [{
                    start: startIndex,
                    end: startIndex + query.length
                }]
            };
        }

        // Fuzzy matching algorithm
        let queryIndex = 0;
        let textIndex = 0;
        let score = 0;
        let highlights = [];
        let consecutiveMatches = 0;
        let lastMatchIndex = -1;

        while (queryIndex < query.length && textIndex < text.length) {
            if (query[queryIndex] === text[textIndex]) {
                if (lastMatchIndex === textIndex - 1) {
                    consecutiveMatches++;
                    score += 5 + consecutiveMatches; // Bonus for consecutive matches
                } else {
                    consecutiveMatches = 0;
                    score += 3;
                }

                highlights.push({ start: textIndex, end: textIndex + 1 });
                lastMatchIndex = textIndex;
                queryIndex++;
            }
            textIndex++;
        }

        // Must match all query characters
        if (queryIndex < query.length) {
            return null;
        }

        // Bonus for shorter text (more relevant)
        score += Math.max(0, 50 - text.length);

        // Bonus for matching at word boundaries
        const wordBoundaryMatches = this.countWordBoundaryMatches(query, text);
        score += wordBoundaryMatches * 10;

        return { score, highlights };
    }

    /**
     * Count matches that occur at word boundaries
     * @param {string} query Search query
     * @param {string} text Text to search in
     * @returns {number} Number of word boundary matches
     */
    static countWordBoundaryMatches(query, text) {
        let count = 0;
        const words = text.split(/[\s\-_\.]/);

        for (const word of words) {
            if (word.toLowerCase().startsWith(query.toLowerCase())) {
                count++;
            }
        }

        return count;
    }

    /**
     * Search multiple terms (space-separated) with AND logic
     * @param {string} query Multi-word search query
     * @param {string} text Text to search in
     * @returns {object|null} Combined match result or null
     */
    static multiTermSearch(query, text) {
        const terms = query.trim().split(/\s+/).filter(term => term.length > 0);
        if (terms.length === 0) return null;
        if (terms.length === 1) return this.fuzzyMatch(terms[0], text);

        let totalScore = 0;
        let allHighlights = [];

        // All terms must match
        for (const term of terms) {
            const match = this.fuzzyMatch(term, text);
            if (!match) return null;

            totalScore += match.score;
            allHighlights.push(...match.highlights);
        }

        // Average score across terms
        totalScore = totalScore / terms.length;

        // Merge overlapping highlights
        allHighlights.sort((a, b) => a.start - b.start);
        const mergedHighlights = [];
        let current = allHighlights[0];

        for (let i = 1; i < allHighlights.length; i++) {
            const next = allHighlights[i];
            if (current.end >= next.start) {
                current.end = Math.max(current.end, next.end);
            } else {
                mergedHighlights.push(current);
                current = next;
            }
        }
        if (current) mergedHighlights.push(current);

        return { score: totalScore, highlights: mergedHighlights };
    }
}

/**
 * Node representing either a Markdown file or a directory containing Markdown files
 */
class MarkdownNode {
    /**
     * @param {string} label Display name of the node
     * @param {vscode.Uri} uri Uri to the file or directory
     * @param {string} type Type of node ('file' or 'directory')
     */    constructor(label, uri, type) {
        this.label = label;
        this.uri = uri;
        this.type = type;
        this.isMarkdownFile = type === 'file' && label.toLowerCase().endsWith('.md');
        this.collapsibleState = type === 'directory' ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None;
        // Enhanced file type detection
        this.fileType = this._detectFileType(label);
        this.lastModified = null;
        this.fileSize = null;
        this.readingTime = null;

        // First level header text for display enhancement
        this.firstLevelHeader = null;

        // Search-related properties
        this.searchScore = 0;
        this.searchHighlights = [];
        this.headerMatches = []; // For header content matches
    }
    /**
   * Detect the type of markdown file based on filename patterns
   * @param {string} filename The filename to analyze
   * @returns {string} The detected file type
   */
    _detectFileType(filename) {
        const lower = filename.toLowerCase();

        // Exact filename matches (highest priority)
        if (lower === 'readme.md') return 'readme-exact';
        if (lower === 'changelog.md') return 'changelog-exact';
        if (lower === 'history.md') return 'history-exact';
        if (lower === 'license.md') return 'license-exact';

        // Filename prefix matches (secondary priority)
        if (lower.startsWith('readme')) return 'readme';
        if (lower.startsWith('changelog')) return 'changelog';
        if (lower.startsWith('history')) return 'history';
        if (lower.startsWith('license')) return 'license';

        // Content-based matches
        if (lower.includes('analysis')) return 'analysis';
        if (lower.includes('doc') || lower.includes('guide') || lower.includes('manual')) return 'docs';
        if (lower.includes('tutorial') || lower.includes('howto') || lower.includes('getting-started')) return 'tutorial';
        if (lower.includes('api') || lower.includes('reference')) return 'api';
        if (lower.includes('spec') || lower.includes('requirement')) return 'spec';
        if (lower.includes('test') || lower.includes('example')) return 'test';
        if (lower.includes('note') || lower.includes('draft')) return 'notes';
        if (lower.includes('todo') || lower.includes('task')) return 'todo';

        return 'default';
    }/**
     * Get the appropriate icon for this file type
     * @returns {vscode.Uri} Icon path for VS Code
     */    getFileIcon() {
        const iconMap = {
            // Exact filename matches (darker shades)
            'readme-exact': 'readme-exact.svg',
            'changelog-exact': 'changelog-exact.svg',
            'history-exact': 'history-exact.svg',
            'license-exact': 'license-exact.svg',

            // Prefix matches (lighter shades of same color families)
            'readme': 'readme.svg',
            'changelog': 'changelog.svg',
            'history': 'history.svg',
            'license': 'license.svg',

            // Other file types
            'analysis': 'analysis.svg',
            'docs': 'docs.svg',
            'tutorial': 'tutorial.svg',
            'api': 'api.svg',
            'spec': 'spec.svg',
            'notes': 'notes.svg',
            'todo': 'todo.svg',
            'test': 'test.svg',
            'default': 'default.svg'
        };

        const iconFile = iconMap[this.fileType] || 'default.svg';
        return vscode.Uri.file(getExtensionAssetPath('icons', 'bullets', iconFile));
    }
    /**
   * Get enhanced tooltip with file information
   * @returns {string} Enhanced tooltip text
   */
    getEnhancedTooltip() {
        let tooltip = this.label;

        if (this.isMarkdownFile) {
            tooltip += `\nType: ${this.fileType.charAt(0).toUpperCase() + this.fileType.slice(1)} Document`;

            if (this.fileSize) {
                tooltip += `\nSize: ${this._formatFileSize(this.fileSize)}`;
            }

            if (this.readingTime) {
                tooltip += `\nEstimated reading time: ${this.readingTime} min`;
            }

            if (this.lastModified) {
                tooltip += `\nLast modified: ${this.lastModified.toLocaleDateString()}`;
            }
        }

        return tooltip;
    }

    /**
     * Format file size in human-readable format
     * @param {number} bytes File size in bytes
     * @returns {string} Formatted size
     */
    _formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${Math.round(bytes / (1024 * 1024))} MB`;
    }
    /**
   * Set file metadata for enhanced display
   * @param {object} metadata File metadata object
   */
    setMetadata(metadata) {
        this.fileSize = metadata.size;
        this.lastModified = metadata.lastModified;
        this.readingTime = metadata.readingTime;
    }
    /**
   * Set search result data for this node
   * @param {number} score Search relevance score
   * @param {Array} highlights Array of highlight ranges
   * @param {Array} headerMatches Array of matching headers
   */
    setSearchData(score, highlights, headerMatches = []) {
        this.searchScore = score;
        this.searchHighlights = highlights;
        this.headerMatches = headerMatches;
    }

    /**
     * Set the first level header text for enhanced display
     * @param {string} headerText The first level header text
     */
    setFirstLevelHeader(headerText) {
        this.firstLevelHeader = headerText;
    }

    /**
     * Get display label with search highlighting (for future UI enhancement)
     * @returns {string} Label with potential highlighting markup
     */
    getDisplayLabel() {
        if (!this.searchHighlights || this.searchHighlights.length === 0) {
            return this.label;
        }

        // For now, return the original label
        // Future enhancement: could return with highlighting markup
        return this.label;
    }
}

/**
 * TreeDataProvider for the Markdown Compass sidebar
 * Provides a hierarchical view of directories and Markdown files
 */
class MarkdownTreeDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._browseMode = getConfiguredBrowseMode();
        // Enable gitignore filtering by default
        this._useGitIgnore = true;
        // Cache for gitignore rules by workspace folder
        this._gitIgnoreCache = new Map();
        // Enhanced search functionality
        this._searchQuery = '';
        this._expandedPaths = new Map(); // Store expanded state during search
        this._searchResults = new Map(); // Cache search results by file path
        this._searchHistory = []; // Store recent searches
        this._maxSearchHistory = 10;
        // Header content cache for searching
        this._headerCache = new Map();
        // Track expanded directories for proper icon display
        this._expandedDirectories = new Set();
        // Auto-expansion state tracking
        this._isInitialLoad = true;
        this._autoExpandedPaths = new Set(); // Track which paths were auto-expanded
        this._firstMarkdownDepth = new Map(); // Cache depth of first markdown file per directory
        this._treeView = null;
        this._rootItemsCache = null;
        this._rootScanPromise = null;
        this._categoryChildrenCache = new Map();
        this._initialExpandedRootDirectories = new Set();
        this._rootScanLoadingFrames = ['.', '..', '...'];
        this._rootScanLoadingFrameIndex = 0;
        this._rootScanLoadingInterval = null;
        this._activeRootScanToken = 0;
    }

    attachTreeView(treeView) {
        this._treeView = treeView;
        this._syncTreeViewPresentation();

        if (this._rootScanPromise) {
            this._ensureRootScanLoadingVisible();
        }
    }

    _syncTreeViewPresentation() {
        if (!this._treeView) {
            return;
        }

        this._treeView.description = this.isCategoryBrowseMode()
            ? 'By category'
            : 'By tree';
    }

    getBrowseMode() {
        return this._browseMode;
    }

    isCategoryBrowseMode() {
        return this._browseMode === MARKDOWN_BROWSE_MODES.CATEGORY;
    }

    setBrowseMode(mode, options = {}) {
        const normalizedMode = normalizeBrowseMode(mode);
        const modeChanged = this._browseMode !== normalizedMode;
        this._browseMode = normalizedMode;
        this._syncTreeViewPresentation();

        if (!modeChanged) {
            return false;
        }

        this.refresh();

        if (options.showMessage !== false) {
            const browseModeLabel = this.isCategoryBrowseMode() ? 'Category' : 'Tree';
            vscode.window.showInformationMessage(`Markdown browse mode: ${browseModeLabel}`);
        }

        return true;
    }

    syncBrowseModeFromConfiguration() {
        return this.setBrowseMode(getConfiguredBrowseMode(), { showMessage: false });
    }

    _setTreeViewMessage(message) {
        if (!this._treeView) {
            return;
        }

        this._treeView.message = message || undefined;
    }

    _renderRootScanLoadingMessage() {
        const suffix = this._rootScanLoadingFrames[this._rootScanLoadingFrameIndex];
        const scanLabel = this.isCategoryBrowseMode()
            ? 'Scanning workspace for categorized Markdown documents'
            : 'Scanning workspace for Markdown documents';
        this._setTreeViewMessage(`${scanLabel}${suffix}`);
    }

    _ensureRootScanLoadingVisible() {
        if (!this._treeView || !this._activeRootScanToken) {
            return;
        }

        this._renderRootScanLoadingMessage();

        if (this._rootScanLoadingInterval) {
            return;
        }

        // Animate the scan status so long scans do not look stalled.
        this._rootScanLoadingInterval = setInterval(() => {
            if (!this._activeRootScanToken) {
                return;
            }

            this._rootScanLoadingFrameIndex =
                (this._rootScanLoadingFrameIndex + 1) % this._rootScanLoadingFrames.length;
            this._renderRootScanLoadingMessage();
        }, 400);
    }

    _beginRootScanLoading() {
        this._activeRootScanToken += 1;
        this._rootScanLoadingFrameIndex = 0;

        if (this._rootScanLoadingInterval) {
            clearInterval(this._rootScanLoadingInterval);
            this._rootScanLoadingInterval = null;
        }

        this._ensureRootScanLoadingVisible();
        return this._activeRootScanToken;
    }

    _endRootScanLoading(scanToken) {
        if (scanToken !== this._activeRootScanToken) {
            return;
        }

        this._activeRootScanToken = 0;
        this._rootScanLoadingFrameIndex = 0;

        if (this._rootScanLoadingInterval) {
            clearInterval(this._rootScanLoadingInterval);
            this._rootScanLoadingInterval = null;
        }

        this._setTreeViewMessage(undefined);
    }

    async _loadRootItems() {
        if (this._rootScanPromise) {
            return this._rootScanPromise;
        }

        const scanToken = this._beginRootScanLoading();

        this._rootScanPromise = (async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (!workspaceFolders || workspaceFolders.length === 0) {
                this._rootItemsCache = [];
                this._isInitialLoad = false;
                return;
            }

            this._rootItemsCache = this.isCategoryBrowseMode()
                ? await this._buildCategoryRootItems(workspaceFolders)
                : await this._buildDirectoryRootItems(workspaceFolders);
            this._isInitialLoad = false;
        })();

        try {
            await this._rootScanPromise;
        } finally {
            this._rootScanPromise = null;
            this._endRootScanLoading(scanToken);
            this._onDidChangeTreeData.fire();
        }
    }

    async _buildDirectoryRootItems(workspaceFolders) {
        const rootItems = [];
        for (const folder of workspaceFolders) {
            if (await this._containsMarkdownFiles(folder.uri)) {
                const folderNode = new MarkdownNode(folder.name, folder.uri, 'directory');

                const shouldAutoExpand = await this._shouldAutoExpand(folder.uri);
                folderNode.collapsibleState = shouldAutoExpand
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed;

                rootItems.push(folderNode);
            }
        }

        if (!this._searchQuery && rootItems.length > 0) {
            rootItems[0].collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }

        return rootItems;
    }

    async _buildCategoryRootItems(workspaceFolders) {
        this._categoryChildrenCache.clear();

        const categorizedFiles = new Map();
        for (const folder of workspaceFolders) {
            await this._collectCategorizedMarkdownFiles(folder.uri, categorizedFiles);
        }

        const rootItems = [];
        for (const categoryKey of BROWSE_CATEGORY_ORDER) {
            const items = categorizedFiles.get(categoryKey);
            if (!items || items.length === 0) {
                continue;
            }

            items.sort((a, b) => {
                const left = (a.relativePath || a.label).toLowerCase();
                const right = (b.relativePath || b.label).toLowerCase();
                return left.localeCompare(right);
            });

            this._categoryChildrenCache.set(categoryKey, items);
            rootItems.push(this._createCategoryNode(categoryKey, items.length));
        }

        return rootItems;
    }

    /**
     * Refresh the tree view and clear caches
     */
    refresh(options = {}) {
        const resetInitialLoad = options.resetInitialLoad !== false;
        const clearRootCache = options.clearRootCache !== false;

        console.log('DEBUG: TreeDataProvider.refresh() called');
        // Clear gitignore cache
        this._gitIgnoreCache.clear();
        // Clear header cache to prevent stale data
        this._headerCache.clear();
        // Clear search results cache
        this._searchResults.clear();
        this._categoryChildrenCache.clear();

        if (clearRootCache) {
            this._rootItemsCache = null;
            this._rootScanPromise = null;

            if (!this._activeRootScanToken) {
                this._setTreeViewMessage(undefined);
            }
        }

        if (resetInitialLoad) {
            this._isInitialLoad = true;
            this._autoExpandedPaths.clear();
            this._firstMarkdownDepth.clear();
            this._initialExpandedRootDirectories.clear();
        }

        // Fire event to refresh tree
        this._onDidChangeTreeData.fire();
    }

    /**
     * Set search query and refresh the tree
     * @param {string} query Search query
     */
    setSearchQuery(query) {
        // Add to search history if it's a new search
        if (query && query !== this._searchQuery) {
            this._addToSearchHistory(query);
        }

        // If search is being cleared, reset expanded paths and search results
        if (this._searchQuery && !query) {
            this._expandedPaths.clear();
            this._searchResults.clear();
        }

        this._searchQuery = query || '';
        this.refresh({
            resetInitialLoad: false,
            clearRootCache: this.isCategoryBrowseMode()
        });
    }

    /**
     * Clear the search
     */
    clearSearch() {
        this._searchQuery = '';
        this._expandedPaths.clear();
        this._searchResults.clear();
        this.refresh({
            resetInitialLoad: false,
            clearRootCache: this.isCategoryBrowseMode()
        });
    }

    /**
     * Add query to search history
     * @param {string} query Search query to add
     */
    _addToSearchHistory(query) {
        // Remove if already exists
        this._searchHistory = this._searchHistory.filter(q => q !== query);
        // Add to beginning
        this._searchHistory.unshift(query);
        // Limit size
        if (this._searchHistory.length > this._maxSearchHistory) {
            this._searchHistory = this._searchHistory.slice(0, this._maxSearchHistory);
        }
    }

    /**
     * Get search history for autocomplete/suggestions
     * @returns {Array<string>} Recent search queries
     */
    getSearchHistory() {
        return [...this._searchHistory];
    }

    /**
     * Enhanced search matching using fuzzy search
     * @param {MarkdownNode} item Tree item to check
     * @returns {Promise<boolean>} True if the item matches or there's no search query
     */
    async _matchesSearch(item) {
        // If no search query, everything matches
        if (!this._searchQuery) {
            return true;
        }

        // Check cache first
        const cacheKey = `${item.uri.fsPath}:${this._searchQuery}`;
        if (this._searchResults.has(cacheKey)) {
            const cachedResult = this._searchResults.get(cacheKey);
            item.setSearchData(cachedResult.score, cachedResult.highlights, cachedResult.headerMatches);
            return cachedResult.matches;
        }

        // Perform fuzzy search on the visible name and, when available, the relative path.
        const searchableText = item.relativePath && item.relativePath !== item.label
            ? `${item.label} ${item.relativePath}`
            : item.label;
        const nameMatch = FuzzySearchUtils.multiTermSearch(this._searchQuery, searchableText);
        let totalScore = nameMatch ? nameMatch.score : 0;
        let allHighlights = nameMatch ? nameMatch.highlights : [];
        let headerMatches = [];

        // For markdown files, also search in headers
        if (item.isMarkdownFile && totalScore < 50) {
            const headerMatch = await this._searchInHeaders(item);
            if (headerMatch) {
                totalScore = Math.max(totalScore, headerMatch.score * 0.8); // Headers get slightly lower priority
                headerMatches = headerMatch.headers;
            }
        }

        const matches = totalScore > 0;

        // Cache the result
        this._searchResults.set(cacheKey, {
            matches,
            score: totalScore,
            highlights: allHighlights,
            headerMatches
        });

        // Set search data on the item
        item.setSearchData(totalScore, allHighlights, headerMatches);

        return matches;
    }    /**
     * Search within markdown file headers
     * @param {MarkdownNode} item Markdown file item
     * @returns {Promise<object|null>} Header search results
     */
    async _searchInHeaders(item) {
        try {
            // Check header cache first
            const filePath = item.uri.fsPath;
            if (!this._headerCache.has(filePath)) {
                // Read and parse headers
                const content = await vscode.workspace.fs.readFile(item.uri);
                const text = Buffer.from(content).toString('utf8');
                const headers = this._extractHeaders(text);
                this._headerCache.set(filePath, headers);
            }

            const headers = this._headerCache.get(filePath);
            const matchingHeaders = [];
            let bestScore = 0;

            for (const header of headers) {
                const match = FuzzySearchUtils.multiTermSearch(this._searchQuery, header.text);
                if (match) {
                    matchingHeaders.push({
                        ...header,
                        score: match.score,
                        highlights: match.highlights
                    });
                    bestScore = Math.max(bestScore, match.score);
                }
            }

            if (matchingHeaders.length > 0) {
                return {
                    score: bestScore,
                    headers: matchingHeaders
                };
            }
        } catch (error) {
            console.error(`Error searching headers in ${item.uri.fsPath}:`, error);
        }

        return null;
    }    /**
     * Extract headers from markdown content
     * @param {string} content Markdown file content
     * @returns {Array} Array of header objects
     */
    _extractHeaders(content) {
        const headers = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

            if (headerMatch) {
                headers.push({
                    level: headerMatch[1].length,
                    text: headerMatch[2],
                    line: i + 1
                });
            }
        }

        return headers;
    }

    /**
     * Extract the first level 1 header from markdown content
     * @param {string} content Markdown file content
     * @returns {string|null} First H1 header text or null if none found
     */
    _extractFirstLevelHeader(content) {
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            const headerMatch = trimmedLine.match(/^#{1}\s+(.+)$/);

            if (headerMatch) {
                return headerMatch[1].trim();
            }
        }

        return null;
    }

    /**
     * Check if a directory might contain files that match the search query
     * @param {vscode.Uri} dirUri Directory URI to check
     * @returns {Promise<boolean>} True if the directory might contain matching files
     */
    async _directoryMightContainMatches(dirUri) {
        if (!this._searchQuery) {
            return true;
        }

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);

            // Check all entries in this directory
            for (const [name, type] of entries) {
                // Use fuzzy search for file/directory name matching
                const match = FuzzySearchUtils.multiTermSearch(this._searchQuery, name);
                if (match) {
                    return true;
                }

                // For markdown files, also check header content
                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    const fileUri = vscode.Uri.joinPath(dirUri, name);
                    const fileNode = new MarkdownNode(name, fileUri, 'file');
                    if (await this._matchesSearch(fileNode)) {
                        return true;
                    }
                }

                // If this is a subdirectory, check it too (recursively)
                if (type === vscode.FileType.Directory) {
                    const subDirUri = vscode.Uri.joinPath(dirUri, name);
                    if (await this._directoryMightContainMatches(subDirUri)) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.error(`Error checking directory for matches: ${error}`);
            return false;
        }
    }

    /**
     * Toggle gitignore filtering
     */
    toggleGitIgnoreFiltering() {
        this._useGitIgnore = !this._useGitIgnore;
        vscode.window.showInformationMessage(`GitIgnore filtering is now ${this._useGitIgnore ? 'enabled' : 'disabled'}`);
        this.refresh();
    }

    async _ensureRootItemsLoaded() {
        if (!this._rootItemsCache) {
            await this._loadRootItems();
        } else if (this._rootScanPromise) {
            await this._rootScanPromise;
        }

        return this._rootItemsCache || [];
    }

    _getRelativeMarkdownPath(fileUri) {
        const includeWorkspaceFolder = (vscode.workspace.workspaceFolders || []).length > 1;
        return vscode.workspace.asRelativePath(fileUri, includeWorkspaceFolder);
    }

    _createCategoryNode(categoryKey, childCount) {
        const metadata = getBrowseCategoryMetadata(categoryKey);
        const categoryNode = new MarkdownNode(
            metadata.label,
            vscode.Uri.from({ scheme: 'markdown-compass-category', path: `/${categoryKey}` }),
            'category'
        );

        categoryNode.categoryKey = categoryKey;
        categoryNode.childCount = childCount;
        categoryNode.collapsibleState = this._searchQuery
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed;

        return categoryNode;
    }

    async _createMarkdownFileNode(fileUri, name, options = {}) {
        const fileNode = new MarkdownNode(name, fileUri, 'file');
        fileNode.relativePath = options.relativePath || this._getRelativeMarkdownPath(fileUri);
        fileNode.workspaceFolderName = options.workspaceFolderName || this._getWorkspaceFolder(fileUri)?.name || null;

        if (options.parentCategoryKey) {
            fileNode.parentCategoryKey = options.parentCategoryKey;
        }

        try {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const text = Buffer.from(content).toString('utf8');
            const firstHeader = this._extractFirstLevelHeader(text);
            if (firstHeader) {
                fileNode.setFirstLevelHeader(firstHeader);
            }

            const stats = await vscode.workspace.fs.stat(fileUri);
            const wordCount = text.split(/\s+/).length;
            const readingTime = Math.max(1, Math.ceil(wordCount / 200));
            fileNode.setMetadata({
                size: stats.size,
                lastModified: new Date(stats.mtime),
                readingTime
            });
        } catch (error) {
            console.warn(`Could not read file ${fileUri.fsPath} for header extraction:`, error);
        }

        const matchesSearch = await this._matchesSearch(fileNode);
        return matchesSearch ? fileNode : null;
    }

    async _collectCategorizedMarkdownFiles(dirUri, categorizedFiles) {
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const workspaceFolder = this._getWorkspaceFolder(dirUri);
            const gitIgnoreRules = await this.getGitIgnoreRules(workspaceFolder ? workspaceFolder.uri : null);

            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    const fileNode = await this._createMarkdownFileNode(childUri, name, {
                        relativePath: this._getRelativeMarkdownPath(childUri),
                        workspaceFolderName: workspaceFolder?.name || null
                    });
                    if (!fileNode) {
                        continue;
                    }

                    const categoryKey = getBrowseCategoryKey(fileNode.fileType);
                    fileNode.parentCategoryKey = categoryKey;

                    if (!categorizedFiles.has(categoryKey)) {
                        categorizedFiles.set(categoryKey, []);
                    }

                    categorizedFiles.get(categoryKey).push(fileNode);
                } else if (type === vscode.FileType.Directory) {
                    await this._collectCategorizedMarkdownFiles(childUri, categorizedFiles);
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dirUri.fsPath} for categorized browse mode:`, error);
        }
    }

    async getSerializedTreeSnapshot(maxDepth = 1) {
        const depth = Number.isFinite(maxDepth)
            ? Math.max(0, Math.min(maxDepth, 2))
            : 1;
        const rootItems = await this._ensureRootItemsLoaded();

        const serializeNode = async (node, remainingDepth) => {
            const snapshot = {
                label: node.label,
                type: node.type,
                categoryKey: node.categoryKey || null,
                fileType: node.fileType || null,
                childCount: node.childCount || 0,
                relativePath: node.relativePath || null,
                firstLevelHeader: node.firstLevelHeader || null
            };

            if (remainingDepth > 0 && (node.type === 'directory' || node.type === 'category')) {
                const children = await this.getChildren(node);
                snapshot.children = await Promise.all(
                    children.map(child => serializeNode(child, remainingDepth - 1))
                );
            }

            return snapshot;
        };

        return Promise.all(rootItems.map(item => serializeNode(item, depth)));
    }

    /**
     * Find the depth at which the first markdown file exists in a directory
     * @param {vscode.Uri} dirUri Directory URI to check
     * @param {number} currentDepth Current depth in the tree
     * @param {number} maxDepth Maximum depth to search
     * @returns {Promise<number|null>} Depth of first markdown file or null if none found
     */
    async _findFirstMarkdownDepth(dirUri, currentDepth = 0, maxDepth = 5) {
        // Check cache first
        const cacheKey = dirUri.toString();
        if (this._firstMarkdownDepth.has(cacheKey)) {
            return this._firstMarkdownDepth.get(cacheKey);
        }

        // Prevent infinite recursion
        if (currentDepth >= maxDepth) {
            this._firstMarkdownDepth.set(cacheKey, null);
            return null;
        }

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const workspaceFolder = this._getWorkspaceFolder(dirUri);
            const gitIgnoreRules = await this.getGitIgnoreRules(workspaceFolder ? workspaceFolder.uri : null);

            // First check if there are any markdown files at this level
            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    this._firstMarkdownDepth.set(cacheKey, currentDepth);
                    return currentDepth;
                }
            }

            // If no markdown files at this level, check subdirectories
            let minSubDepth = null;
            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.Directory) {
                    const subDepth = await this._findFirstMarkdownDepth(childUri, currentDepth + 1, maxDepth);
                    if (subDepth !== null) {
                        if (minSubDepth === null || subDepth < minSubDepth) {
                            minSubDepth = subDepth;
                        }
                    }
                }
            }

            this._firstMarkdownDepth.set(cacheKey, minSubDepth);
            return minSubDepth;
        } catch (error) {
            console.error(`Error finding first markdown depth in ${dirUri.fsPath}:`, error);
            this._firstMarkdownDepth.set(cacheKey, null);
            return null;
        }
    }

    /**
     * Find the path to the first markdown file in a directory
     * @param {vscode.Uri} dirUri Directory URI to check
     * @param {number} maxDepth Maximum depth to search
     * @returns {Promise<vscode.Uri[]|null>} Array of directory URIs leading to first markdown file
     */
    async _findPathToFirstMarkdown(dirUri, maxDepth = 5) {
        const cacheKey = `path:${dirUri.toString()}`;
        if (this._firstMarkdownDepth.has(cacheKey)) {
            return this._firstMarkdownDepth.get(cacheKey);
        }

        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const workspaceFolder = this._getWorkspaceFolder(dirUri);
            const gitIgnoreRules = await this.getGitIgnoreRules(workspaceFolder ? workspaceFolder.uri : null);

            // First check if there are any markdown files at this level
            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    // Found markdown file at this level, return empty path (already at target)
                    this._firstMarkdownDepth.set(cacheKey, []);
                    return [];
                }
            }

            // If no markdown files at this level, check subdirectories
            const sortedDirs = [];
            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.Directory) {
                    sortedDirs.push({ name, uri: childUri });
                }
            }

            // Sort directories alphabetically for consistent behavior
            sortedDirs.sort((a, b) => a.name.localeCompare(b.name));            // Check each subdirectory for markdown files
            for (const { uri: childUri } of sortedDirs) {
                if (maxDepth <= 0) break;

                const subPath = await this._findPathToFirstMarkdown(childUri, maxDepth - 1);
                if (subPath !== null) {
                    // Found a path in this subdirectory
                    const fullPath = [childUri, ...subPath];
                    this._firstMarkdownDepth.set(cacheKey, fullPath);
                    return fullPath;
                }
            }

            this._firstMarkdownDepth.set(cacheKey, null);
            return null;
        } catch (error) {
            console.error(`Error finding path to first markdown in ${dirUri.fsPath}:`, error);
            this._firstMarkdownDepth.set(cacheKey, null);
            return null;
        }
    }    /**
     * Determine if a directory should be auto-expanded during initial load
     * @param {vscode.Uri} dirUri Directory URI to check
     * @returns {Promise<boolean>} True if directory should be auto-expanded
     */
    async _shouldAutoExpand(dirUri) {
        // Only auto-expand during initial load
        if (!this._isInitialLoad) {
            return false;
        }

        // Don't auto-expand if we're in search mode
        if (this._searchQuery) {
            return false;
        }

        // Check if we've already determined this path should be auto-expanded
        const pathKey = dirUri.toString();
        if (this._autoExpandedPaths.has(pathKey)) {
            return true;
        }

        // For root workspace folders, always check for auto-expansion
        const isWorkspaceRoot = this._isWorkspaceRoot(dirUri);

        if (isWorkspaceRoot) {
            // Find the path to the first markdown file
            const pathToFirstMarkdown = await this._findPathToFirstMarkdown(dirUri);
            if (pathToFirstMarkdown && pathToFirstMarkdown.length > 0) {
                // Mark the first directory in the path for auto-expansion
                const firstDirInPath = pathToFirstMarkdown[0];
                this._autoExpandedPaths.add(firstDirInPath.toString());
                console.log(`Auto-expanding workspace root ${dirUri.fsPath} - path leads through ${firstDirInPath.fsPath}`);
                return true;
            }
        } else {
            // For non-root directories, check if this directory is in the path to first markdown
            const parentWorkspaceFolder = this._getWorkspaceFolder(dirUri);
            if (parentWorkspaceFolder) {
                const pathToFirstMarkdown = await this._findPathToFirstMarkdown(parentWorkspaceFolder.uri);
                if (pathToFirstMarkdown) {
                    // Check if current directory is in the path
                    const isInPath = pathToFirstMarkdown.some(pathUri => pathUri.toString() === dirUri.toString());
                    if (isInPath) {
                        this._autoExpandedPaths.add(pathKey);
                        console.log(`Auto-expanding ${dirUri.fsPath} - in path to first markdown`);
                        return true;
                    }
                }
            }
        }

        return false;
    }

    _isWorkspaceRoot(dirUri) {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        return workspaceFolders.some(folder => folder.uri.toString() === dirUri.toString());
    }

    /**
     * Get the TreeItem for the given element
     * @param {MarkdownNode} element
     * @returns {vscode.TreeItem}
     */    getTreeItem(element) {
        // Create the basic tree item structure
        let displayLabel = element.label;
        let isUsingSanitizedHeadingLabel = false;

        // For markdown files with first level headers, show header text above filename
        if (element.type === 'file' && element.isMarkdownFile && element.firstLevelHeader) {
            // Strip emoji from rendered tree labels while preserving the original heading elsewhere.
            const sanitizedHeadingLabel = stripEmojiForTreeLabel(element.firstLevelHeader);
            displayLabel = sanitizedHeadingLabel || element.label;
            isUsingSanitizedHeadingLabel = sanitizedHeadingLabel.length > 0 && displayLabel !== element.label;
        }

        const treeItem = new vscode.TreeItem(displayLabel, element.collapsibleState);
        // Enhanced label and tooltip for search results and file metadata
        let tooltip = element.isMarkdownFile ? element.getEnhancedTooltip() : element.label;

        // Add first level header to tooltip if present
        if (element.firstLevelHeader) {
            tooltip = `${element.firstLevelHeader}\nFile: ${element.label}\n\n${tooltip}`;
        }

        if (this._searchQuery && element.searchScore > 0) {
            // Enhanced tooltip with search information
            if (element.headerMatches && element.headerMatches.length > 0) {
                tooltip += `\n\nMatching headers:`;
                element.headerMatches.forEach(header => {
                    tooltip += `\n  ${'#'.repeat(header.level)} ${header.text} (line ${header.line})`;
                });
            }
            tooltip += `\nSearch relevance: ${Math.round(element.searchScore)}`;
        }

        treeItem.tooltip = tooltip;        if (element.type === 'file' && element.isMarkdownFile) {
            // Route left-click preview opens through the shared preview command.
            treeItem.command = {
                command: 'markdown-compass.previewMarkdownFile',
                title: 'Preview Markdown File',
                arguments: [element]
            };
            treeItem.contextValue = 'markdownFile';
            const fileIcon = element.getFileIcon();

            console.log(`DEBUG: getTreeItem for ${element.label} - fileIcon: ${fileIcon ? 'YES' : 'NO'}`);

            treeItem.iconPath = fileIcon;
            treeItem.resourceUri = element.uri; // Add resourceUri for file icons

            // Enhanced descriptions for different states
            let description = '';

            // If we have a first level header, show the filename as description
            if (isUsingSanitizedHeadingLabel) {
                description = element.label;
                if (this.isCategoryBrowseMode() && element.relativePath) {
                    description = element.relativePath;
                }
            } else if (this._searchQuery && element.searchScore > 0) {
                // Search result information
                if (element.headerMatches?.length > 0) {
                    description = `${element.headerMatches.length} header${element.headerMatches.length > 1 ? 's' : ''}`;
                } else {
                    description = `Score: ${Math.round(element.searchScore)}`;
                }
                if (element.searchScore > 75) {
                    treeItem.iconPath = vscode.Uri.file(getExtensionAssetPath('icons', 'bullets', 'search-highlight.svg'));
                }
            } else if (element.readingTime && element.fileSize) {
                description = `${element.readingTime}min read`;
            }

            if (this.isCategoryBrowseMode() && element.relativePath && description === `${element.readingTime}min read`) {
                description = element.relativePath;
            } else if (this.isCategoryBrowseMode() && element.relativePath && !description) {
                description = element.relativePath === element.label
                    ? (element.workspaceFolderName || '')
                    : element.relativePath;
            }

            treeItem.description = description;
        } else if (element.type === 'category') {
            treeItem.iconPath = getBrowseCategoryIconPath(element.categoryKey);
            treeItem.contextValue = 'markdownCategory';
            treeItem.description = `${element.childCount} file${element.childCount === 1 ? '' : 's'}`;
            treeItem.tooltip = `${element.label}\n${element.childCount} Markdown file${element.childCount === 1 ? '' : 's'}`;
        } else if (element.type === 'file') {
            // Non-markdown file - should not happen with our filter
            treeItem.iconPath = new vscode.ThemeIcon('file');
            treeItem.resourceUri = element.uri;
            treeItem.contextValue = 'file';
        } else {
            // Directory - use different icons based on collapsible state
            // Use a dynamic approach that checks both element state and any override conditions
            const isExpanded = this._isDirectoryExpanded(element);
            treeItem.iconPath = vscode.Uri.file(getExtensionAssetPath(
                'icons',
                'bullets',
                isExpanded ? 'folder-opened.svg' : 'folder-closed.svg'
            ));
            treeItem.resourceUri = element.uri;
            treeItem.contextValue = 'directory';
        }

        return treeItem;
    }

    /**
     * Check if a directory is currently expanded in the tree view
     * @param {MarkdownNode} element Directory element to check
     * @returns {boolean} True if directory is expanded
     */
    _isDirectoryExpanded(element) {
        if (!element || (element.type !== 'directory' && element.type !== 'category')) {
            return false;
        }

        // Check if this container is in our expanded set
        const dirKey = element.uri.toString();
        return this._expandedDirectories.has(dirKey);
    }

    /**
     * Handle tree item expansion event
     * @param {MarkdownNode} element The expanded element
     */
    _onTreeItemExpanded(element) {
        if (element && (element.type === 'directory' || element.type === 'category')) {
            const dirKey = element.uri.toString();
            this._expandedDirectories.add(dirKey);
            console.log(`Tree item expanded: ${element.label}`);

            // Refresh the tree item to update the icon
            this._onDidChangeTreeData.fire(element);
        }
    }

    /**
     * Handle tree item collapse event
     * @param {MarkdownNode} element The collapsed element
     */
    _onTreeItemCollapsed(element) {
        if (element && (element.type === 'directory' || element.type === 'category')) {
            const dirKey = element.uri.toString();
            this._expandedDirectories.delete(dirKey);
            console.log(`Tree item collapsed: ${element.label}`);

            // Refresh the tree item to update the icon
            this._onDidChangeTreeData.fire(element);
        }
    }

    /**
     * Load .gitignore rules for a workspace folder
     * @param {vscode.Uri} workspaceFolderUri 
     * @returns {Promise<any|null>}
     */
    async getGitIgnoreRules(workspaceFolderUri) {
        // If not using gitignore filtering, return null
        if (!this._useGitIgnore) {
            return null;
        }

        // Check cache first
        if (this._gitIgnoreCache.has(workspaceFolderUri.fsPath)) {
            return this._gitIgnoreCache.get(workspaceFolderUri.fsPath);        }

        // Create a new ignore instance
        const ig = ignore.default();

        try {
            // Find all .gitignore files in the workspace
            const gitIgnorePath = vscode.Uri.joinPath(workspaceFolderUri, '.gitignore');

            try {
                // Check if .gitignore exists
                await vscode.workspace.fs.stat(gitIgnorePath);

                // Read the .gitignore file
                const content = await vscode.workspace.fs.readFile(gitIgnorePath);
                const gitIgnoreContent = Buffer.from(content).toString('utf8');

                // Add rules to the ignore instance
                ig.add(gitIgnoreContent);
                console.log(`Loaded .gitignore from ${gitIgnorePath.fsPath}`);
            } catch (error) {
                // .gitignore file doesn't exist or couldn't be read
                console.log(`No .gitignore found at ${gitIgnorePath.fsPath} or error reading it: ${error.message}`);
            }

            // Cache the rules
            this._gitIgnoreCache.set(workspaceFolderUri.fsPath, ig);
            return ig;
        } catch (error) {
            console.error(`Error loading .gitignore rules: ${error}`);
            return null;
        }
    }

    /**
     * Set the parent of a tree item
     * @param {MarkdownNode} element 
     * @returns {Promise<MarkdownNode|null>}
     */
    async getParent(element) {
        if (!element || !element.uri) {
            return null;
        }

        try {
            if (element.type === 'category') {
                return null;
            }

            if (this.isCategoryBrowseMode() && element.type === 'file' && element.parentCategoryKey) {
                const siblings = this._categoryChildrenCache.get(element.parentCategoryKey) || [];
                return this._createCategoryNode(element.parentCategoryKey, siblings.length);
            }

            const elementPath = element.uri.fsPath;

            // If this is a workspace folder (root level), it has no parent
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                for (const folder of workspaceFolders) {
                    if (folder.uri.fsPath === elementPath) {
                        return null; // This is a root workspace folder
                    }
                }
            }

            // Get the parent directory
            const parentUri = vscode.Uri.file(path.dirname(elementPath));

            // Check if parent is a workspace folder
            if (workspaceFolders) {
                for (const folder of workspaceFolders) {
                    if (folder.uri.fsPath === parentUri.fsPath) {
                        return new MarkdownNode(folder.name, folder.uri, 'directory');
                    }
                }
            }

            // Create parent directory node
            const parentName = path.basename(parentUri.fsPath);
            return new MarkdownNode(parentName, parentUri, 'directory');

        } catch (error) {
            console.error('Error getting parent for tree item:', error);
            return null;
        }
    }

    /**
     * Find and reveal a tree item by URI
     * @param {vscode.Uri} targetUri
     * @param {vscode.TreeView} treeView
     * @returns {Promise<boolean>}
     */
    async findAndRevealTreeItem(targetUri, treeView, options = {}) {
        if (!targetUri || !treeView) {
            console.warn('findAndRevealTreeItem: Missing parameters', {
                hasTargetUri: !!targetUri,
                hasTreeView: !!treeView
            });
            return false;
        }

        try {
            const targetPath = targetUri.fsPath;
            console.log(`=== TREE SELECTION DEBUG ===`);
            console.log(`Target file: ${targetPath}`);
            console.log(`Tree view title: ${treeView.title || 'unknown'}`);
            console.log(`Tree view visible: ${treeView.visible}`);

            const shouldFocusView = options.focusView === true;

            // Ensure the tree view is ready only when the caller explicitly wants focus.
            if (shouldFocusView && !treeView.visible) {
                console.warn('Tree view is not visible - attempting to make it visible');
                try {
                    await vscode.commands.executeCommand('markdownCompass.focus');
                } catch (focusError) {
                    console.log('Could not focus tree view:', focusError.message);
                }
            }

            // Find the item by searching through the tree
            const findItem = async (items, depth = 0, parentPath = '', ancestors = []) => {
                if (!items || items.length === 0) {
                    console.log(`  Depth ${depth}: No items to search in ${parentPath || 'root'}`);
                    return null;
                }

                console.log(`  Depth ${depth}: Searching ${items.length} items in ${parentPath || 'root'}`);

                for (const item of items) {
                    const itemPath = item.uri ? item.uri.fsPath : 'no-uri';
                    console.log(`  Depth ${depth}: Checking "${item.label}" (${item.type}) - ${itemPath}`);

                    if (item.uri && item.uri.fsPath === targetPath) {
                        console.log(`  ✓ FOUND matching tree item: ${item.label} at depth ${depth}`);
                        return { item, ancestors };
                    }

                    const shouldSearchChildren =
                        item.type === 'category' ||
                        (item.type === 'directory' && targetPath.startsWith(itemPath + path.sep));

                    if (shouldSearchChildren) {
                        const expansionLabel = item.type === 'category'
                            ? `Target may be in category "${item.label}" - expanding...`
                            : `Target may be in directory "${item.label}" - expanding...`;
                        console.log(`  Depth ${depth}: ${expansionLabel}`);
                        try {
                            const children = await this.getChildren(item);
                            if (children && children.length > 0) {
                                const found = await findItem(children, depth + 1, itemPath, [...ancestors, item]);
                                if (found) return found;
                            } else {
                                console.log(`  Depth ${depth}: "${item.label}" has no children`);
                            }
                        } catch (childError) {
                            console.error(`  Error getting children for ${item.label}:`, childError);
                        }
                    }
                }
                return null;
            };

            // Start search from root
            console.log('Starting search from root level...');
            const rootItems = await this._ensureRootItemsLoaded();
            console.log(`Root items: ${rootItems ? rootItems.length : 0}`);

            if (rootItems && rootItems.length > 0) {
                for (const rootItem of rootItems) {
                    console.log(`Root item: "${rootItem.label}" - ${rootItem.uri?.fsPath}`);
                }
            }

            const foundResult = await findItem(rootItems);

            if (foundResult) {
                const { item: foundItem, ancestors } = foundResult;
                console.log(`Attempting to reveal tree item: "${foundItem.label}"`);
                try {
                    for (const ancestor of ancestors) {
                        try {
                            await treeView.reveal(ancestor, {
                                expand: true,
                                focus: false,
                                select: false
                            });
                        } catch (ancestorRevealError) {
                            console.log(`Could not expand ancestor "${ancestor.label}":`, ancestorRevealError.message);
                        }
                    }

                    // Now reveal and select the target item
                    await treeView.reveal(foundItem, {
                        select: true,
                        focus: false,
                        expand: 1
                    });
                    console.log(`✓ Successfully revealed tree item: ${foundItem.label}`);

                    // Verify selection after a brief delay
                    setTimeout(() => {
                        const selection = treeView.selection;
                        if (selection && selection.length > 0) {
                            const selectedItem = selection[0];
                            console.log(`✓ Tree selection confirmed: ${selectedItem.label}`);
                        } else {
                            console.warn('⚠ Tree selection not confirmed - no items in selection');
                        }
                    }, 150);

                    return true;
                } catch (revealError) {
                    console.error('✗ Error during tree reveal:', revealError);
                    return false;
                }
            } else {
                console.log(`✗ Tree item not found for: ${targetPath}`);

                // Debug: List all items we found to help troubleshoot
                console.log('=== DEBUG: All items in tree ===');
                const debugListItems = async (items, depth = 0) => {
                    if (!items) return;
                    for (const item of items) {
                        console.log(`${'  '.repeat(depth)}${item.label} (${item.type}) - ${item.uri?.fsPath}`);
                        if (item.type === 'directory' || item.type === 'category') {
                            try {
                                const children = await this.getChildren(item);
                                if (children && children.length > 0) {
                                    await debugListItems(children, depth + 1);
                                }
                            } catch (e) {
                                console.log(`${'  '.repeat(depth + 1)}Error getting children: ${e.message}`);
                            }
                        }
                    }
                };
                await debugListItems(rootItems);
                console.log('=== END DEBUG ===');

                return false;
            }
        } catch (error) {
            console.error('✗ Error finding and revealing tree item:', error);
            return false;
        }
    }

    /**
     * Get the children of the given element (required by TreeDataProvider interface)
     * @param {MarkdownNode} element The parent element to get children for (undefined for root)
     * @returns {Promise<MarkdownNode[]>} Array of child elements
     */
    async getChildren(element) {
        // If element is undefined, return workspace root folders
        if (!element) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return [];
            }

            if (!this._rootItemsCache) {
                void this._loadRootItems();
                return [];
            }

            return this._rootItemsCache;
        }

        // For directory elements, return their contents
        if (element.type === 'directory') {
            return await this._getDirectoryContents(element.uri);
        }

        if (element.type === 'category') {
            return this._categoryChildrenCache.get(element.categoryKey) || [];
        }

        // Files don't have children
        return [];
    }

    /**
     * Get contents of a directory, filtered to only include markdown files and directories containing them
     * @param {vscode.Uri} dirUri Directory URI to read
     * @returns {Promise<MarkdownNode[]>} Array of child nodes
     */
    async _getDirectoryContents(dirUri) {
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const items = [];
            const workspaceFolder = this._getWorkspaceFolder(dirUri);
            const gitIgnoreRules = await this.getGitIgnoreRules(workspaceFolder ? workspaceFolder.uri : null);

            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    // This is a markdown file
                    const fileNode = await this._createMarkdownFileNode(childUri, name);
                    if (fileNode) {
                        items.push(fileNode);
                    }
                } else if (type === vscode.FileType.Directory) {
                    // Check if directory contains markdown files or matches search
                    const containsMarkdown = await this._containsMarkdownFiles(childUri);
                    const mightContainMatches = await this._directoryMightContainMatches(childUri);

                    if (containsMarkdown && mightContainMatches) {
                        const dirNode = new MarkdownNode(name, childUri, 'directory');

                        // Set collapsible state based on auto-expansion rules
                        const shouldAutoExpand = await this._shouldAutoExpand(childUri);
                        dirNode.collapsibleState = shouldAutoExpand
                            ? vscode.TreeItemCollapsibleState.Expanded
                            : vscode.TreeItemCollapsibleState.Collapsed;

                        items.push(dirNode);
                    }
                }
            }

            // Sort items: directories first, then files, both alphabetically
            items.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.label.localeCompare(b.label);
            });

            if (this._isWorkspaceRoot(dirUri) && !this._searchQuery) {
                const rootKey = dirUri.toString();
                if (!this._initialExpandedRootDirectories.has(rootKey)) {
                    const firstDirectory = items.find(item => item.type === 'directory');
                    if (firstDirectory) {
                        firstDirectory.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                        this._initialExpandedRootDirectories.add(rootKey);
                    }
                }
            }

            return items;
        } catch (error) {
            console.error(`Error reading directory ${dirUri.fsPath}:`, error);
            return [];
        }
    }

    /**
     * Check if a directory contains markdown files (recursively)
     * @param {vscode.Uri} dirUri Directory URI to check
     * @returns {Promise<boolean>} True if directory contains markdown files
     */
    async _containsMarkdownFiles(dirUri) {
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const workspaceFolder = this._getWorkspaceFolder(dirUri);
            const gitIgnoreRules = await this.getGitIgnoreRules(workspaceFolder ? workspaceFolder.uri : null);

            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    return true;
                } else if (type === vscode.FileType.Directory) {
                    // Recursively check subdirectories
                    if (await this._containsMarkdownFiles(childUri)) {
                        return true;
                    }
                }
            }
            return false;
        } catch (error) {
            console.error(`Error checking if directory contains markdown files: ${error}`);
            return false;
        }
    }

    /**
     * Get workspace folder for a given URI
     * @param {vscode.Uri} uri File or directory URI
     * @returns {vscode.WorkspaceFolder|null} The workspace folder containing the URI
     */
    _getWorkspaceFolder(uri) {
        return vscode.workspace.getWorkspaceFolder(uri);
    }

    /**
     * Get comprehensive workspace statistics
     * @returns {Promise<object>} Statistics about markdown files in the workspace
     */
    async getWorkspaceStatistics() {
        const stats = {
            totalFiles: 0,
            totalReadingTime: 0,
            fileTypes: {},
            averageFileSize: 0,
            totalSize: 0,
            largestFile: null,
            smallestFile: null
        };

        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                return stats;
            }

            for (const folder of workspaceFolders) {
                await this._collectStatistics(folder.uri, stats);
            }

            // Calculate averages
            if (stats.totalFiles > 0) {
                stats.averageFileSize = Math.round(stats.totalSize / stats.totalFiles);
            }

            return stats;
        } catch (error) {
            console.error('Error getting workspace statistics:', error);
            return stats;
        }
    }

    /**
     * Recursively collect statistics from a directory
     * @param {vscode.Uri} dirUri Directory to analyze
     * @param {object} stats Statistics object to update
     */
    async _collectStatistics(dirUri, stats) {
        try {
            const entries = await vscode.workspace.fs.readDirectory(dirUri);
            const workspaceFolder = this._getWorkspaceFolder(dirUri);
            const gitIgnoreRules = await this.getGitIgnoreRules(workspaceFolder ? workspaceFolder.uri : null);

            for (const [name, type] of entries) {
                const childUri = vscode.Uri.joinPath(dirUri, name);
                const relativePath = vscode.workspace.asRelativePath(childUri);

                // Apply .gitignore filtering
                if (gitIgnoreRules && gitIgnoreRules.ignores(relativePath)) {
                    continue;
                }

                if (type === vscode.FileType.File && name.toLowerCase().endsWith('.md')) {
                    const fileNode = new MarkdownNode(name, childUri, 'file');

                    // Count file
                    stats.totalFiles++;

                    // Add to file types
                    const ext = path.extname(name).toLowerCase();
                    stats.fileTypes[ext] = (stats.fileTypes[ext] || 0) + 1;

                    // Get file size
                    try {
                        const fileStat = await vscode.workspace.fs.stat(childUri);
                        const fileSize = fileStat.size;
                        stats.totalSize += fileSize;

                        // Track largest and smallest files
                        if (!stats.largestFile || fileSize > stats.largestFile.size) {
                            stats.largestFile = { name, size: fileSize };
                        }
                        if (!stats.smallestFile || fileSize < stats.smallestFile.size) {
                            stats.smallestFile = { name, size: fileSize };
                        }
                    } catch (sizeError) {
                        console.warn(`Could not get size for ${name}:`, sizeError);
                    }

                    try {
                        const content = await vscode.workspace.fs.readFile(childUri);
                        const text = Buffer.from(content).toString('utf8');
                        const wordCount = text.split(/\s+/).filter(Boolean).length;
                        stats.totalReadingTime += Math.max(1, Math.ceil(wordCount / 200));
                    } catch (contentError) {
                        console.warn(`Could not estimate reading time for ${name}:`, contentError);
                    }
                } else if (type === vscode.FileType.Directory) {
                    // Recursively process subdirectories
                    await this._collectStatistics(childUri, stats);
                }
            }
        } catch (error) {
            console.warn(`Error collecting statistics from ${dirUri.fsPath}:`, error);
        }
    }
}

/**
 * Header view provider for displaying markdown file headers
 */
class MarkdownHeaderViewProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._headers = [];
        this._currentFile = null;
    }

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Update headers for a specific markdown file
     * @param {vscode.Uri} fileUri URI of the markdown file
     */
    async updateHeaders(fileUri) {
        try {
            this._currentFile = fileUri;
            const content = await vscode.workspace.fs.readFile(fileUri);
            const text = Buffer.from(content).toString('utf8');
            this._headers = this._extractHeaders(text);
            this.refresh();
        } catch (error) {
            console.error('Error updating headers:', error);
            this._headers = [];
            this.refresh();
        }
    }

    /**
     * Clear headers but keep the view visible with placeholder
     */
    clearHeaders() {
        this._currentFile = null;
        this._headers = [];
        this.refresh();
    }

    /**
     * Extract headers from markdown content
     * @param {string} content Markdown file content
     * @returns {Array} Array of header objects
     */
    _extractHeaders(content) {
        const headers = [];
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

            if (headerMatch) {
                headers.push({
                    level: headerMatch[1].length,
                    text: headerMatch[2],
                    line: i + 1,
                    id: `header-${i}-${headerMatch[1].length}`
                });
            }
        }

        return headers;
    }

    getTreeItem(element) {
        // Handle placeholder item when no document is selected
        if (element.isPlaceholder) {
            const treeItem = new vscode.TreeItem(element.text, vscode.TreeItemCollapsibleState.None);
            treeItem.description = '';
            treeItem.tooltip = 'Click on a markdown file to view its headers';
            treeItem.iconPath = new vscode.ThemeIcon('info');
            // No command for placeholder - it's just informational
            return treeItem;
        }

        const hasChildren = element.children && element.children.length > 0;
        const collapsibleState = hasChildren ?
            vscode.TreeItemCollapsibleState.Expanded :
            vscode.TreeItemCollapsibleState.None;

        const treeItem = new vscode.TreeItem(element.text, collapsibleState);
        // Removed line number from description - cleaner display
        treeItem.description = '';
        treeItem.tooltip = `${element.text} (Line ${element.line})`;

        // Set icon based on header level with hierarchical icons
        const iconMap = {
            1: 'book',           // H1 - Book
            2: 'bookmark',       // H2 - Bookmark  
            3: 'list-ordered',   // H3 - List
            4: 'note',           // H4 - Note
            5: 'pencil',         // H5 - Pencil
            6: 'dash'            // H6 - Dash
        };        treeItem.iconPath = new vscode.ThemeIcon(iconMap[element.level] || 'symbol-field');

        // Command to navigate to header
        treeItem.command = {
            command: 'markdown-compass.goToHeader',
            title: 'Go to Header',
            arguments: [element.line]
        };

        return treeItem;
    }

    getChildren(element) {
        if (!element) {
            // If no current file, show placeholder
            if (!this._currentFile) {
                return [{
                    text: 'Select a document for viewing',
                    isPlaceholder: true
                }];
            }

            // Return top-level headers (hierarchically structured)
            const hierarchy = this._buildHierarchy();

            // If no headers found, show informational message
            if (hierarchy.length === 0) {
                return [{
                    text: 'No headers found in document',
                    isPlaceholder: true
                }];
            }

            return hierarchy;
        }
        // Return children of this header
        return element.children || [];
    }

    /**
     * Build hierarchical structure from flat header list
     * @returns {Array} Hierarchically structured headers
     */
    _buildHierarchy() {
        if (!this._headers || this._headers.length === 0) {
            return [];
        }

        const result = [];
        const stack = []; // Stack to track parent headers at each level

        for (const header of this._headers) {
            // Create header object with children array
            const headerNode = {
                ...header,
                children: []
            };

            // Pop from stack until we find a valid parent (lower level number)
            while (stack.length > 0 && stack[stack.length - 1].level >= header.level) {
                stack.pop();
            }

            if (stack.length === 0) {
                // This is a top-level header
                result.push(headerNode);
            } else {
                // This is a child of the header on top of the stack
                stack[stack.length - 1].children.push(headerNode);
            }

            // Push current header to stack
            stack.push(headerNode);
        }

        return result;
    }
}

/**
 * Called when the extension is activated
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Markdown Compass extension is being activated');

    // Track the last previewed markdown file
    let lastPreviewedMarkdownFile = null;

    // Create the tree data provider
    const treeDataProvider = new MarkdownTreeDataProvider();
    const headerProvider = new MarkdownHeaderViewProvider();
    const favoritesProvider = new FavoritesTreeDataProvider(
        context,
        treeDataProvider,
        'markdown-compass.previewMarkdownFile'
    );

    // Register the tree view
    const treeView = vscode.window.createTreeView('markdownCompass', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
    });    // Register the header view
    treeDataProvider.attachTreeView(treeView);
    const headerView = vscode.window.createTreeView('markdownHeaders', {
        treeDataProvider: headerProvider
    });    // Register the favorites view
    const favoritesView = vscode.window.createTreeView('markdownFavorites', {
        treeDataProvider: favoritesProvider
    });
    const previewSyncDebugState = {
        lastMainTreeSyncTargetUri: null,
        lastFavoriteSyncTargetUri: null,
        lastMainTreeRevealSucceeded: false,
        lastFavoriteRevealSucceeded: false
    };
    let lastObservedActivePreviewUri = null;

    const normalizePreviewTrackingUri = (uri) => {
        if (!uri) {
            return null;
        }

        return uri.with({ fragment: '', query: '' });
    };

    const previewNode = async (node, options = {}) => {
        if (!node || !node.uri) {
            return;
        }

        const normalizedTargetUri = normalizePreviewTrackingUri(node.uri);
        await previewRouting.openPreview(normalizedTargetUri, options);
        await syncPreviewedDocumentState(normalizedTargetUri);
        console.log(`Previewed markdown file: ${node.uri.fsPath}`);
    };

    const getTabInputUri = (input) => {
        if (!input || !input.uri) {
            return null;
        }

        if (input.uri instanceof vscode.Uri) {
            return input.uri;
        }

        if (typeof input.uri.toString === 'function') {
            try {
                return vscode.Uri.parse(input.uri.toString());
            } catch (error) {
                console.warn('Could not parse preview tab URI string:', error);
            }
        }

        if (typeof input.uri === 'object' && typeof input.uri.scheme === 'string' && typeof input.uri.path === 'string') {
            try {
                return vscode.Uri.from(input.uri);
            } catch (error) {
                console.warn('Could not revive preview tab URI components:', error);
            }
        }

        return null;
    };

    const isMarkdownPreviewTab = (tab) => {
        if (!tab || !tab.input) {
            return false;
        }

        if (typeof tab.input.viewType === 'string' && tab.input.viewType.includes('markdown.preview')) {
            return true;
        }

        const constructorName = tab.input?.constructor?.name;
        return constructorName === 'TabInputWebview' || constructorName === 'TabInputCustom';
    };

    const getActiveMarkdownPreviewUri = () => {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
        if (!isMarkdownPreviewTab(activeTab)) {
            return null;
        }

        return getTabInputUri(activeTab.input);
    };

    const getLastRenderedPreviewUri = () => {
        const previewRenderState = getSafePreviewRenderDebugState();
        if (typeof previewRenderState.lastNormalizedDocumentUri !== 'string') {
            return null;
        }

        try {
            return vscode.Uri.parse(previewRenderState.lastNormalizedDocumentUri, true);
        } catch (error) {
            console.warn('Could not parse last rendered preview URI:', error);
            return null;
        }
    };

    const syncPreviewedDocumentState = async (fileUri) => {
        const normalizedUri = normalizePreviewTrackingUri(fileUri);
        if (!normalizedUri) {
            return;
        }

        lastPreviewedMarkdownFile = normalizedUri;

        await vscode.commands.executeCommand('setContext', 'markdownCompassActiveDocument', true);
        await headerProvider.updateHeaders(normalizedUri);
        previewSyncDebugState.lastMainTreeSyncTargetUri = normalizedUri.toString();
        previewSyncDebugState.lastFavoriteSyncTargetUri = normalizedUri.toString();
        previewSyncDebugState.lastMainTreeRevealSucceeded = await treeDataProvider.findAndRevealTreeItem(normalizedUri, treeView);
        previewSyncDebugState.lastFavoriteRevealSucceeded = await favoritesProvider.findAndRevealTreeItem(normalizedUri, favoritesView);
    };

    const syncPreviewStateFromActiveTab = async (attempt = 0) => {
        const activePreviewUri = getLastRenderedPreviewUri() || getActiveMarkdownPreviewUri();
        if (!activePreviewUri) {
            if (attempt < 2) {
                setTimeout(() => {
                    void syncPreviewStateFromActiveTab(attempt + 1);
                }, 50);
            }
            return;
        }

        const normalizedActivePreviewUri = normalizePreviewTrackingUri(activePreviewUri);
        if (!normalizedActivePreviewUri) {
            return;
        }

        if (lastObservedActivePreviewUri === normalizedActivePreviewUri.toString()) {
            return;
        }

        lastObservedActivePreviewUri = normalizedActivePreviewUri.toString();
        await syncPreviewedDocumentState(normalizedActivePreviewUri);
    };

    // Track tree view events for proper icon updates    context.subscriptions.push(
    context.subscriptions.push(
        treeView.onDidExpandElement(e => {
            treeDataProvider._onTreeItemExpanded(e.element);
        }),
        treeView.onDidCollapseElement(e => {
            treeDataProvider._onTreeItemCollapsed(e.element);
        })
    );

    // Function to update the context for showing/hiding the header view
    const updateMarkdownContext = (editor) => {
        const isMarkdownFile = editor && editor.document && editor.document.languageId === 'markdown';

        // ALWAYS keep the Current Document view visible
        vscode.commands.executeCommand('setContext', 'markdownCompassActiveDocument', true);

        if (isMarkdownFile) {
            // Update header view with the active markdown file
            headerProvider.updateHeaders(editor.document.uri);
            // Update the tracking variable since we have an active markdown editor
            lastPreviewedMarkdownFile = normalizePreviewTrackingUri(editor.document.uri);
            console.log(`Markdown context set: ${editor.document.uri.fsPath}`);
        } else {
            // Check if we have a previewed markdown file before clearing headers
            if (lastPreviewedMarkdownFile) {
                // Keep showing headers for the last previewed file
                console.log(`Keeping headers for previewed file: ${lastPreviewedMarkdownFile.fsPath}`);
                // Don't clear headers if we have a preview active
                return;
            } else {
                // Clear headers but keep the view visible with placeholder
                headerProvider.clearHeaders();
                console.log('Markdown context cleared - showing placeholder');
            }
        }
    };

    // Listen for active editor changes to update context
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(updateMarkdownContext),
        vscode.window.tabGroups.onDidChangeTabs(() => {
            setTimeout(() => {
                void syncPreviewStateFromActiveTab();
            }, 0);
        }),
        vscode.workspace.onDidCloseTextDocument((document) => {
            if (document.languageId === 'markdown') {
                // Check if the closed document was our tracked preview file
                if (lastPreviewedMarkdownFile && lastPreviewedMarkdownFile.toString() === document.uri.toString()) {
                    lastPreviewedMarkdownFile = null;
                    console.log('Tracked preview file was closed - clearing tracking');
                }

                // Check if there are any other markdown files still open
                const hasOpenMarkdown = vscode.window.visibleTextEditors.some(
                    editor => editor.document.languageId === 'markdown'
                );
                if (!hasOpenMarkdown && !lastPreviewedMarkdownFile) {
                    // Don't hide the view, just clear headers and show placeholder
                    headerProvider.clearHeaders();
                    console.log('Last markdown file closed - showing placeholder');
                }
            }
        }),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('markdownCompass.browseMode')) {
                treeDataProvider.syncBrowseModeFromConfiguration();
            }
        })
    );

    // Set initial context - ALWAYS show the Current Document view
    vscode.commands.executeCommand('setContext', 'markdownCompassActiveDocument', true);
    updateMarkdownContext(vscode.window.activeTextEditor);    // Initialize search context
    void syncPreviewStateFromActiveTab();
    const previewStatePollHandle = setInterval(() => {
        void syncPreviewStateFromActiveTab();
    }, 250);
    context.subscriptions.push({
        dispose: () => {
            clearInterval(previewStatePollHandle);
        }
    });
    vscode.commands.executeCommand('setContext', 'markdown-compass:isSearchActive', false);

    // Register commands - THIS SECTION IS CRITICAL
    // Make sure every command registered here matches what's defined in package.json
    context.subscriptions.push(
        // Refresh command - Fix the command ID to match package.json
        vscode.commands.registerCommand('markdown-compass.refresh', () => {
            treeDataProvider.refresh();
        }),

        // Add to favorites
        vscode.commands.registerCommand('markdown-compass.addToFavorites', async (node) => {
            if (node && node.uri) {
                await favoritesProvider.addToFavorites(node);
            }
        }),

        // Remove from favorites
        vscode.commands.registerCommand('markdown-compass.removeFromFavorites', async (node) => {
            if (node && node.uri) {
                await favoritesProvider.removeFromFavorites(node);
            }
        }),

        // Search command - Fix the command ID to match package.json
        vscode.commands.registerCommand('markdown-compass.searchMarkdownFiles', async () => {
            const query = await vscode.window.showInputBox({
                placeHolder: 'Search markdown folders, files, and headers...',
                prompt: 'Enter terms to match directory names, markdown file names, and markdown headers',
                value: treeDataProvider._searchQuery
            });

            if (query !== undefined) {
                treeDataProvider.setSearchQuery(query);
                vscode.commands.executeCommand('setContext', 'markdown-compass:isSearchActive', !!query);
            }
        }),

        vscode.commands.registerCommand('markdown-compass.__test.describePreviewRoute', (request = {}) => {
            const uri = request.uri ? vscode.Uri.parse(request.uri) : undefined;

            if (!uri) {
                throw new Error('Preview route test helper requires a uri string');
            }

            let route;
            if (request.kind === 'header') {
                route = previewRouting.describeOpenPreviewAtHeader(uri, {
                    lineNumber: request.lineNumber,
                    headerText: request.headerText
                });
            } else if (request.kind === 'fragment') {
                route = previewRouting.describeOpenPreviewFragment(uri);
            } else if (request.kind === 'tree-open') {
                const normalizedTargetUri = normalizePreviewTrackingUri(uri);

                route = previewRouting.describeOpenPreview(normalizedTargetUri, {
                    toSide: !!request.toSide,
                    locked: !!request.locked
                });
            } else {
                route = previewRouting.describeOpenPreview(uri, {
                    toSide: !!request.toSide,
                    locked: !!request.locked
                });
            }

            return {
                mode: route.mode,
                command: route.command,
                targetUri: route.targetUri.toString(),
                args: route.args.map(serializePreviewRouteArg)
            };
        }),

        vscode.commands.registerCommand('markdown-compass.__test.getPreviewTrackingState', () => ({
            lastPreviewedMarkdownFile: lastPreviewedMarkdownFile?.toString() ?? null,
            currentHeaderFile: headerProvider._currentFile?.toString() ?? null,
            mainTreeSelection: treeView.selection
                .map(item => item?.uri?.toString?.())
                .filter(Boolean),
            favoriteSelection: favoritesView.selection
                .map(item => item?.uri?.toString?.())
                .filter(Boolean),
            activePreviewUri: normalizePreviewTrackingUri(getLastRenderedPreviewUri() || getActiveMarkdownPreviewUri())?.toString() ?? null,
            headerViewVisible: headerView.visible,
            lastMainTreeSyncTargetUri: previewSyncDebugState.lastMainTreeSyncTargetUri,
            lastFavoriteSyncTargetUri: previewSyncDebugState.lastFavoriteSyncTargetUri,
            lastMainTreeRevealSucceeded: previewSyncDebugState.lastMainTreeRevealSucceeded,
            lastFavoriteRevealSucceeded: previewSyncDebugState.lastFavoriteRevealSucceeded
        })),

        vscode.commands.registerCommand('markdown-compass.__test.setBrowseMode', (mode) => {
            treeDataProvider.setBrowseMode(mode, { showMessage: false });
            return treeDataProvider.getBrowseMode();
        }),

        vscode.commands.registerCommand('markdown-compass.__test.stripEmojiTreeLabel', (label) => {
            return stripEmojiForTreeLabel(label);
        }),

        vscode.commands.registerCommand('markdown-compass.__test.getBrowseTreeSnapshot', async (request = {}) => ({
            browseMode: treeDataProvider.getBrowseMode(),
            rootItems: await treeDataProvider.getSerializedTreeSnapshot(request.depth ?? 1)
        })),

        // Search in sidebar command
        vscode.commands.registerCommand('markdown-compass.searchInSidebar', async () => {
            const query = await vscode.window.showInputBox({
                placeHolder: 'Filter the markdown tree by folders, files, and headers...',
                prompt: 'Enter terms to filter the tree by directory names, markdown file names, and markdown headers',
                value: treeDataProvider._searchQuery
            });

            if (query !== undefined) {
                treeDataProvider.setSearchQuery(query);
                vscode.commands.executeCommand('setContext', 'markdown-compass:isSearchActive', !!query);
            }
        }),

        // Clear search command - Single registration only
        vscode.commands.registerCommand('markdown-compass.clearSearch', () => {
            treeDataProvider.clearSearch();
            vscode.commands.executeCommand('setContext', 'markdown-compass:isSearchActive', false);
        }),

        vscode.commands.registerCommand('markdown-compass.toggleBrowseMode', async () => {
            const nextMode = treeDataProvider.getBrowseMode() === MARKDOWN_BROWSE_MODES.CATEGORY
                ? MARKDOWN_BROWSE_MODES.TREE
                : MARKDOWN_BROWSE_MODES.CATEGORY;

            await vscode.workspace.getConfiguration('markdownCompass').update(
                'browseMode',
                nextMode,
                vscode.ConfigurationTarget.Global
            );

            treeDataProvider.setBrowseMode(nextMode, { showMessage: false });
            vscode.window.showInformationMessage(
                `Markdown browse mode: ${nextMode === MARKDOWN_BROWSE_MODES.CATEGORY ? 'Category' : 'Tree'}`
            );
        }),

        // Toggle gitignore
        vscode.commands.registerCommand('markdownCompass.toggleGitIgnore', () => {
            treeDataProvider.toggleGitIgnoreFiltering();
        }),

        // Preview markdown file
        vscode.commands.registerCommand('markdown-compass.previewMarkdownFile', async (node) => {
            if (node && node.uri) {
                try {
                    await previewNode(node);
                } catch (error) {
                    console.error('Error previewing markdown file:', error);
                    vscode.window.showErrorMessage(`Could not preview file: ${error.message}`);
                }
            }
        }),

        vscode.commands.registerCommand('markdown-compass.previewMarkdownFileInNewTab', async (node) => {
            if (node && node.uri) {
                try {
                    await previewNode(node, { locked: true });
                } catch (error) {
                    console.error('Error previewing markdown file in a new tab:', error);
                    vscode.window.showErrorMessage(`Could not preview file in a new tab: ${error.message}`);
                }
            }
        }),

        // Go to header
        vscode.commands.registerCommand('markdown-compass.goToHeader', async (lineNumber) => {
            try {
                if (!headerProvider._currentFile || !lineNumber) {
                    console.warn('No current file or line number for header navigation');
                    return;
                }

                console.log(`Navigating to header at line ${lineNumber} in PREVIEW`);

                // Find the actual header from our parsed headers list instead of parsing the line
                const targetHeader = headerProvider._headers.find(header => header.line === lineNumber);
                if (!targetHeader) {
                    console.warn(`No header found in parsed headers for line ${lineNumber}`);
                    // Fallback: try to open preview and show approximate location
                    await previewRouting.openPreview(headerProvider._currentFile);
                    // Track the preview since we just opened it
                    lastPreviewedMarkdownFile = headerProvider._currentFile;
                    vscode.window.showWarningMessage(`Could not find header at line ${lineNumber}. Preview opened to document.`);
                    return;
                }

                const headerText = targetHeader.text;
                console.log(`Found header: "${headerText}" at line ${lineNumber}`);

                // Method 2: Try VS Code's fragment navigation with multiple anchor formats
                const anchorFormats = [
                    generateVSCodeHeaderAnchor(headerText),
                    generateGitHubStyleAnchor(headerText),
                    generateSimpleAnchor(headerText)
                ];

                for (const anchor of anchorFormats) {
                    if (!anchor) continue;

                    try {
                        console.log(`Trying anchor format: "${anchor}"`);
                        const baseUri = headerProvider._currentFile.toString();
                        const fragmentUri = `${baseUri}#${anchor}`;
                        await previewRouting.openPreviewFragment(vscode.Uri.parse(fragmentUri));

                        // Track the preview since we just opened it
                        lastPreviewedMarkdownFile = headerProvider._currentFile;

                        // Give it a moment to load and scroll
                        await new Promise(resolve => setTimeout(resolve, 200));

                        console.log(`✓ Successfully navigated to header using anchor: ${anchor}`);
                        // Removed the success message - navigation is silent when successful
                        return;
                    } catch (fragmentError) {
                        console.log(`Anchor "${anchor}" failed:`, fragmentError.message);
                    }
                }

                // Method 3: Preview with search suggestion
                try {
                    console.log('Using preview with search suggestion...');
                    await previewRouting.openPreview(headerProvider._currentFile);
                    // Track the preview since we just opened it
                    lastPreviewedMarkdownFile = headerProvider._currentFile;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Copy header text to clipboard for easy searching
                    await vscode.env.clipboard.writeText(headerText);

                    // Show helpful message
                    const action = await vscode.window.showInformationMessage(
                        `Opened preview. Header "${headerText}" has been copied to clipboard. Use Ctrl+F to find it.`,
                        'Search Now'
                    );

                    if (action === 'Search Now') {
                        // Open find in preview
                        await vscode.commands.executeCommand('editor.action.webvieweditor.showFind');
                    }

                    return;

                } catch (previewError) {
                    console.warn('Preview with search failed:', previewError.message);
                }
                // Method 4: Last resort - calculate approximate position
               
                try {

                    console.log('Using approximate position calculation...');

                    await previewRouting.openPreview(headerProvider._currentFile);
                    // Track the preview since we just opened it
                    lastPreviewedMarkdownFile = headerProvider._currentFile;

                    // Read file to calculate position
                    const content = await vscode.workspace.fs.readFile(headerProvider._currentFile);
                    const text = Buffer.from(content).toString('utf8');
                    const lines = text.split('\n');
                    const totalLines = lines.length;
                    const scrollPercentage = Math.min(100, Math.max(0, ((lineNumber - 1) / totalLines) * 100));

                    vscode.window.showInformationMessage(
                        `Preview opened. Header "${headerText}" is approximately ${Math.round(scrollPercentage)}% down the document.`
                    );
                } catch (fallbackError) {
                    console.error('All navigation methods failed:', fallbackError);
                    vscode.window.showErrorMessage('Could not navigate to header in preview');
                }

            } catch (error) {
                console.error('Critical error in header navigation:', error);
                vscode.window.showErrorMessage(`Header navigation error: ${error.message}`);
            }
        }),

        // Refresh headers command
        vscode.commands.registerCommand('markdown-compass.refreshHeaders', () => {
            headerProvider.refresh();
        }),

        // Copy header link command
        vscode.commands.registerCommand('markdown-compass.copyHeaderLink', async (element) => {
            if (element && element.text && element.line) {
                const headerAnchor = generateVSCodeHeaderAnchor(element.text);
                const link = `#${headerAnchor}`;
                await vscode.env.clipboard.writeText(link);
                vscode.window.showInformationMessage(`Header link copied: ${link}`);
            }
        }),

        // Show workspace stats command
        vscode.commands.registerCommand('markdown-compass.showWorkspaceStats', async () => {
            const stats = await treeDataProvider.getWorkspaceStatistics();

            const message = `Markdown Workspace Statistics:
            
Total Files: ${stats.totalFiles}
Total Reading Time: ${stats.totalReadingTime} minutes
Average File Size: ${stats.averageFileSize} bytes

${stats.largestFile ? `Largest File: ${stats.largestFile.name} (${stats.largestFile.size} bytes)` : ''}
${stats.smallestFile ? `Smallest File: ${stats.smallestFile.name} (${stats.smallestFile.size} bytes)` : ''}`;

            vscode.window.showInformationMessage(message);
        }),

        // Open file command
        vscode.commands.registerCommand('markdown-compass.openFile', async (node) => {
            if (node && node.uri) {
                await vscode.window.showTextDocument(node.uri);
            }
        }),

        // Open in editor command
        vscode.commands.registerCommand('markdown-compass.openInEditor', async (node) => {
            if (node && node.uri) {
                await vscode.window.showTextDocument(node.uri, { preview: false });
            }
        }),

        // Copy path command
        vscode.commands.registerCommand('markdown-compass.copyPath', async (node) => {
            if (node && node.uri) {
                await vscode.env.clipboard.writeText(node.uri.fsPath);
                vscode.window.showInformationMessage('Path copied to clipboard');
            }
        })
    );

    console.log('Markdown Compass extension activated successfully');
}

/**
 * Generate VS Code-compatible header anchor using their exact algorithm
 * @param {string} headerText The header text to convert to anchor
 * @returns {string} The generated anchor
 */
function generateVSCodeHeaderAnchor(headerText) {
    // VS Code's algorithm for generating header anchors
    return headerText
        .toLowerCase()
        .trim()
        // Remove markdown formatting
        .replace(/[`*_~\[\]()]/g, '')
        // Replace non-word characters except spaces and hyphens
        .replace(/[^\w\s-\u00A0-\uFFFF]/g, '')
        // Replace whitespace with hyphens
        .replace(/\s+/g, '-')
        // Collapse multiple hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '')
        // Ensure it's not empty
        || 'header';
}

/**
 * Generate GitHub-style header anchor
 * @param {string} headerText The header text
 * @returns {string} GitHub-style anchor
 */
function generateGitHubStyleAnchor(headerText) {
    return headerText
        .toLowerCase()
        .trim()
        // Remove punctuation except hyphens and spaces
        .replace(/[^\w\s-]/g, '')
        // Replace spaces with hyphens
        .replace(/\s+/g, '-')
        // Collapse multiple hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '');
}

/**
 * Generate simple alphanumeric anchor
 * @param {string} headerText The header text
 * @returns {string} Simple anchor
 */
function generateSimpleAnchor(headerText) {
    return headerText
        .toLowerCase()
        .trim()
        // Keep only alphanumeric and spaces
        .replace(/[^a-z0-9\s]/g, '')
        // Replace spaces with hyphens
        .replace(/\s+/g, '-')
        // Remove multiple hyphens
        .replace(/-+/g, '-')
        // Remove leading/trailing hyphens
        .replace(/^-+|-+$/g, '');
}

// Make sure to export the activate function
export function deactivate() {}

export { activate };
