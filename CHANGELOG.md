# Changelog

All notable changes to the "Markdown Compass" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Category Browse Mode**: Added a new `markdownCompass.browseMode` setting and a toolbar toggle so the Markdown Files view can switch between the existing workspace tree and category-grouped browsing.

### Changed
- **Categorized Markdown Discovery**: Reused the existing document-type heuristics to group files into buckets such as README, changelog, tests, notes, todo, and other markdown while preserving preview, favorites, and header navigation behavior.

## [1.7.1] - 2026-05-26

### Changed
- **Rebranding QA Closeout**: Finalized the marketplace-facing rename from Markdown Navigator to Markdown Compass across the shipped extension surfaces while leaving historical internal work artifacts untouched.
- **Preview Asset Polish**: Added transparent padding to the preview image for cleaner marketplace presentation.

### Fixed
- **Release Metadata Alignment**: Synced the root package-lock version with the extension manifest so the packaged release metadata matches `package.json`.

## [1.7.0] - 2026-05-25

### Changed
- **README**: Rewrote introduction and purpose section to lead with the problems the extension solves, added persona-oriented "Who is this for?" section covering code-adjacent documentation and AI-assisted workflow use cases.

## [1.6.31] - 2026-05-25

### Added
- **Open Preview in New Tab**: Right-click any item in the Markdown Files or Favorites tree to open an additional locked native preview panel without replacing the current one.
- **Tree Scan Loading Animation**: The Markdown Files pane now displays an animated dot-cycling message ("Scanning workspace...") while the initial workspace scan is in progress.

### Changed
- **Native Preview Only**: Retired the legacy enhanced preview runtime, commands, settings, dependencies, and asset chain so all preview opens now route exclusively through VS Code's built-in markdown preview.
- **Marketplace Metadata Alignment**: Updated the manifest publisher identity and shared marketplace metadata to match the other published VS Code extensions in this workspace.
- **Search Scope Clarity**: Search toolbar input prompts now explicitly describe the filter scope — folder names, markdown file names, and markdown headers (H1–H6). Both `Search Markdown Files` and `Filter in Sidebar` commands expose the same fuzzy tree filter.
- **Documentation and Smoke Coverage**: Updated active docs and preview-routing smoke coverage to match the native-preview-only architecture.
- **CFML Highlighting Ownership**: CFML fenced code-block highlighting remains delegated to the dedicated `markdown-cfml-syntax` extension.

## [1.6.13] - 2025-05-31

### Added
- **Expanded Theme Selection**: Added six new markdown preview themes (three light, three dark) for better customization options:
  - **Light Themes**: Light Modern, Light Sepia, Light Technical
  - **Dark Themes**: Dark Vibrant, Dark Elegant, Dark Technical
- **Alphabetically Sorted Themes**: All theme options are now sorted alphabetically in the theme selection dialog
- **Theme Showcase**: Added a new theme showcase file in testing directory to demonstrate all available themes
- **Enhanced Documentation**: Updated README.md with detailed theme descriptions and categorization

### Technical Implementation
- Added CSS files for all new themes in both styles directory and root directory
- Enhanced theme switching functionality in extension.js
- Updated package.json configuration schema to include new theme options
- Reorganized theme options to be alphabetically sorted in extension.js and package.json

## [1.6.5] - 2025-05-30

### Added
- **Enhanced File Display**: Markdown files in the Documentation Files tree now display their first level header (H1) text above the filename for better content identification
- **Smart Label Display**: Files with H1 headers show the header as the main label with filename as description; files without H1 headers display filename only
- **Header Extraction**: Automatic extraction and caching of first level headers during tree construction for improved performance
- **Enhanced Tooltips**: Tooltips now include both header text and filename information for better context

### Technical Implementation
- Added `firstLevelHeader` property to MarkdownNode class
- Implemented `_extractFirstLevelHeader()` method for efficient H1 extraction
- Enhanced `getTreeItem()` method to display headers as primary labels
- Graceful error handling for files that cannot be read

## [1.6.1] - 2025-05-29

### Fixed
- **Header Navigation Reliability**: Fixed persistent issues with header navigation where clicks would show warning messages instead of scrolling the preview
- **Preview Focus Management**: Improved preview window focus handling to ensure header navigation works consistently
- **Fragment Navigation Enhancement**: Enhanced markdown fragment generation to handle edge cases with special characters in headers
- **Command Sequencing**: Fixed timing issues between opening preview and scrolling to specific headers

### Enhanced
- **Robust Error Handling**: Added comprehensive error handling with detailed logging for header navigation troubleshooting
- **Multiple Navigation Strategies**: Implemented progressive fallback strategies for maximum compatibility across VS Code versions
- **Preview State Detection**: Better detection of preview window state before attempting navigation
- **User Feedback**: Improved error messages to help users understand navigation issues

## [1.6.0] - 2025-05-29

### Fixed
- **Hierarchical Header Display**: Fixed regression where "Current Document" panel was showing headers in a flat list instead of hierarchical structure
- **Header Tree Structure**: Headers now properly display as collapsible tree with proper parent-child relationships based on header levels (H1 > H2 > H3, etc.)
- **Header Navigation Regression**: Fixed critical regression where clicking headers in Current Document view was opening source editor instead of scrolling the markdown preview
- **Preview-First Navigation**: Completely redesigned header navigation to prioritize preview scrolling over editor focus, ensuring clicks stay in preview mode
- **Focus Preservation**: Header navigation preserves focus on the preview pane instead of switching to the editor

### Enhanced
- **Smart Header Icons**: Different header levels now use appropriate icons (book, bookmark, list, note, pencil, dash) for visual hierarchy
- **Collapsible Headers**: Parent headers with child headers are now collapsible/expandable for better organization
- **Preview Command Strategy**: Navigation now uses `markdown.showPreview` command first, then syncs editor selection in background
- **Multiple Fallback Strategies**: Implemented robust fallback navigation including direct preview scrolling and editor-to-preview sync
- **Error Handling**: Improved error handling for header navigation with helpful error messages and console logging

### Technical
- **Tree Building Algorithm**: Implemented proper hierarchical tree building from flat header list using stack-based approach
- **Dynamic Collapsible States**: Headers with children automatically set to expandable state
- **Preview-Centric Approach**: Navigation command now opens/refreshes preview first, then handles editor synchronization
- **Background Editor Management**: Uses background document manipulation without stealing focus from preview
- **Sequential Command Execution**: Proper timing and sequencing of VS Code commands for reliable preview navigation

## [1.5.1] - 2025-05-29

### Fixed
- **Header View Display**: Fixed critical issue where "Current Document" panel (header view) was not displaying
- **Context Variable**: Added missing `markdownCompassActiveDocument` context variable that controls header view visibility
- **Active File Tracking**: Extension now properly tracks when markdown files are opened, closed, or become active
- **Preview Integration**: Header view now correctly appears when using "Preview Markdown File" command

### Enhanced
- **Dynamic Context Updates**: Header view visibility now responds immediately to markdown file state changes
- **Event Handling**: Added comprehensive event listeners for editor changes and document closures
- **Improved Debugging**: Enhanced logging for context variable changes and header view state

### Technical
- **Context Management**: Proper implementation of VS Code context API for conditional view display
- **Event Subscriptions**: Added `onDidChangeActiveTextEditor` and `onDidCloseTextDocument` event handlers
- **State Synchronization**: Header view content now stays synchronized with active markdown file

## [1.5.0] - 2025-05-29

### Added
- **Smart Auto-Expansion**: Tree view now automatically expands folders on initial load to reveal the first markdown file descendant
- **Intelligent Folder Opening**: Directories are expanded only as deep as necessary to show the first available markdown files
- **Depth-Aware Loading**: Auto-expansion stops at the level where markdown files are found, preventing over-expansion
- **Performance Optimized**: Uses caching to efficiently determine optimal expansion depth without redundant file system calls

### Enhanced
- **Improved Initial Experience**: Users no longer need to manually expand folders to see available markdown files
- **Contextual Behavior**: Auto-expansion only occurs during initial load, preserving user's manual folder state during subsequent interactions
- **Search-Aware**: Auto-expansion is disabled when search mode is active to prevent interference with search results
- **Debug Logging**: Enhanced console logging to track auto-expansion decisions for troubleshooting

### Technical
- **Depth Detection**: New `_findFirstMarkdownDepth()` method efficiently calculates optimal expansion depth
- **State Tracking**: Added `_isInitialLoad`, `_autoExpandedPaths`, and `_firstMarkdownDepth` for intelligent state management
- **Cache Optimization**: Prevents redundant directory scanning during expansion calculation
- **Icon Consistency**: Maintains proper folder icon states (open/closed) during auto-expansion

## [1.4.0] - 2025-05-29

### Enhanced
- **Isometric 3D Icons**: Updated 15 core file type icons with beautiful isometric 3D versions from SVG Repo
- **Icon Collection**: Integrated icons from the "Isometric 3D Interface Icons" collection for modern aesthetic
- **Visual Consistency**: All icons now feature cohesive isometric styling with proper depth and perspective

### Changed
- **File Type Icons**: Replaced flat icons with 3D isometric equivalents:
  - api → Application (isometric device)
  - changelog/default/docs → Document (isometric file)
  - file-status → Information (isometric info icon)
  - folder-closed/folder-opened → Folder (isometric directory)
  - notes → Pen (isometric writing tool)
  - progress → Time (isometric clock)
  - readme → Front Page (isometric document)
  - search-highlight → Search (isometric magnifying glass)
  - spec → Report (isometric document stack)
  - test → Thumbs Up (isometric approval)
  - todo → Collect (isometric checklist)
  - tutorial → Hint (isometric help bubble)

### Technical
- **Source**: SVG Repo collection (https://www.svgrepo.com/collection/isometric-3d-interface-icons/)
- **Theme Support**: Maintained dark/light theme compatibility with automatic color conversion
- **Icon Count**: 30 total icons updated (15 light + 15 dark theme versions)
- **Quality**: High-resolution SVG icons with consistent 3D perspective

## [1.2.1] - 2025-05-27

### Fixed
- **Method Spacing**: Fixed missing space after `refresh()` method declaration in MarkdownTreeDataProvider
- **Variable Reference**: Fixed undefined variable error in `containsMarkdownFiles` method using incorrect variable name
- **Code Quality**: Improved code consistency and eliminated potential runtime errors

## [1.2.0] - 2025-05-27

### Removed
- **Doc Central Webview**: Completely removed the non-functioning Doc Central webview functionality
- **Webview Commands**: Removed `markdown-compass.openPanel` command and associated menu items
- **Webview Configuration**: Removed all webview-related configuration properties from settings

### Changed
- **Focus on Sidebar**: Extension now focuses entirely on the robust sidebar navigation experience
- **Simplified Architecture**: Streamlined codebase by removing complex webview provider code
- **Improved Stability**: Enhanced extension stability by eliminating problematic webview functionality

### Technical Details
- Moved all webview-related files to `deprecated-webview/` directory
- Updated extension.js to remove webview imports and initialization
- Cleaned up package.json to remove webview commands and configurations
- Maintains all existing sidebar functionality: file navigation, header view, search, and GitIgnore filtering

### Notes
- All core Markdown navigation features remain fully functional
- Future enhancements will focus on improving the sidebar experience
- Users can still navigate files, preview markdown, and use all search functionality

## [1.1.5] - 2025-05-26

### Fixed
- **Critical Syntax Error**: Fixed "Missing catch or finally after try" error in webview-provider-fixed-final.js that was preventing extension activation
- **Method Declaration Spacing**: Fixed improper spacing between method declarations in webview provider
- **Error Handling**: Added robust error handling to webview data collection methods
- **Extension Activation**: Extension now activates successfully without JavaScript syntax errors

### Changed
- **Code Structure**: Improved code organization and error handling throughout the webview provider
- **Debug Functionality**: Enhanced debug command with proper error handling and parameter validation

### Note
- This is a critical bug fix release that resolves extension activation failures
- All core functionality remains the same with improved stability

## [1.0.9] - 2025-05-26

### Reverted
- **Dialog Feature Removal**: Reverted to version 1.0.9 by removing the dialog-style window feature
- **Simplified Interface**: Back to the clean, sidebar-only interface without dialog complexity
- **Extension Stability**: Focused on the core, stable functionality of the extension

### Note
- This version represents a reversion from 1.1.0 to the stable 1.0.9 release
- All dialog-related functionality has been removed
- Core markdown navigation features remain fully functional

## [1.1.0] - 2025-05-26 (Reverted)

### Added
- **Dialog-Style Window**: New dialog window interface accessible via the window icon in the tree view title bar
- **Unified Interface**: Combined file navigation and header outline in a single, focused dialog window
- **Enhanced Search**: Built-in search functionality to quickly filter markdown files
- **Modern UI**: Clean, responsive interface with VS Code theming integration
- **Interactive Navigation**: Click-to-preview files and navigate headers directly from the dialog
- **Dual-Panel Layout**: Side-by-side view of markdown files and current document headers

### Enhanced
- **User Experience**: Alternative interface option for users who prefer dialog-style navigation
- **Accessibility**: Keyboard navigation and screen reader friendly interface
- **Performance**: Efficient rendering of large file lists and header structures

## [1.0.9] - 2025-05-26

### Added
- **Auto-Expansion on Initial Load**: Root folders now automatically expand one level deep when first loading the tree view
- **Smart Initial State**: Auto-expansion only occurs when no markdown preview is currently open and user hasn't interacted with the tree yet
- **Initial Load Detection**: Added logic to detect and handle initial tree view rendering differently from subsequent interactions

### Enhanced
- **Improved User Experience**: Eliminates need to manually expand root folders to see markdown files on first use
- **Conditional Behavior**: Auto-expansion is contextual - only happens when appropriate (no active markdown content)
- **Logging**: Enhanced console logging to track auto-expansion behavior for debugging

## [1.0.8] - 2025-05-26

### Fixed
- **First Click Bug**: Fixed issue where the first click on a markdown file would open the preview but not render the Current Document view until clicked again
- **Headers View Timing**: Added delay mechanism to ensure headers view loads properly when opening markdown previews
- **Active Editor Tracking**: Improved active editor change detection to handle edge cases with preview windows

### Enhanced
- **Error Handling**: Added better error handling for markdown preview command failures
- **Logging**: Enhanced console logging for debugging preview and headers view issues
- **Robustness**: More reliable headers view updates regardless of editor state changes

## [1.0.7] - 2025-05-26

### Removed
- **Folder Control Commands**: Removed unused expand/collapse folder command definitions from package.json
- **Simplified Interface**: Completed transition to native VS Code folder expand/collapse behavior via row clicking

### Changed
- **Tree Navigation**: Now relies entirely on VS Code's built-in folder expand/collapse functionality
- **User Experience**: Cleaner tree view interface without redundant context menu options

## [1.0.6] - 2025-05-26

### Removed
- **Expand All Functionality**: Removed problematic "Expand All" buttons from both Markdown Documents and Current Document views due to reliability issues
- **Expand All Commands**: Removed `markdown-compass.expandAll` and `markdown-compass.expandAllHeaders` commands

### Added
- **Individual Folder Controls**: Added right-click context menu options to expand or collapse individual folders
- **Enhanced Folder Management**: New `markdown-compass.expandFolder` and `markdown-compass.collapseFolder` commands for precise folder control

### Enhanced
- **Improved Reliability**: Replaced unreliable expand all functionality with more stable individual folder controls
- **Better User Experience**: Right-click context menus provide intuitive access to folder expansion/collapse actions

## [1.0.5] - 2025-05-26

### Added
- **Expand All Folders**: New button (⤢) in the Markdown Documents view title bar to expand all folders at once
- **Expand All Headers**: New button (⤢) in the Current Document view title bar to expand all header sections at once
- **Recursive Expansion**: Both expand all features work recursively, expanding all nested folders/headers throughout the tree
- **User Feedback**: Success messages show the number of items expanded when using expand all functionality

### Enhanced
- **Tree Navigation**: Complemented existing collapse all functionality with expand all for complete tree control
- **User Experience**: One-click expansion for better navigation of complex folder structures and long documents

## [1.0.2] - 2025-05-26

### Added
- **Search Icon**: New search capability that opens the search pane with filters set to search for .md files in the workspace root

## [1.0.1] - 2025-05-25

### Fixed
- Fixed Current Document view not loading headers when previewing markdown files from the tree view

## [1.0.0] - 2025-05-25

### Added
- **Markdown Document Tree View**: Hierarchical navigation of all markdown files in your workspace
- **Document Headers View**: Interactive outline showing header hierarchy of the currently viewed markdown file
- **One-Click Preview**: Single-click any markdown file to open it in preview mode
- **Header Navigation**: Click headers in the outline to jump directly to sections in the preview
- **Copy Header Links**: Right-click headers to copy markdown links for cross-referencing
- **Visual Header Hierarchy**: Document-appropriate icons (book, bookmark, list, note, pencil, dash) for different header levels
- **Custom Icons**: Professional compass-themed activity bar icon and custom SVG icons throughout
- **Context Menu Actions**: Right-click files for additional options (open in editor, preview mode)
- **.gitignore Support**: Automatic filtering of ignored files and folders (can be toggled)
- **Smart Folder Display**: Shows only directories containing markdown files
- **Collapsible Navigation**: Expandable/collapsible folder structure
- **Refresh Controls**: Update tree views to reflect file system changes

### Features
- **Activity Bar Integration**: Dedicated sidebar panel with compass navigation icon
- **Dual View Design**: Separate "Markdown Documents" and "Current Document" panels
- **Automatic Updates**: Headers view updates automatically when switching between files
- **Responsive Interface**: Clean, modern UI with document-focused iconography
- **Performance Optimized**: Efficient file scanning with caching mechanisms

### Technical
- **Publisher**: Websolete
- **Author**: Kevin J. Miller
- **License**: MIT
- **VS Code Compatibility**: ^1.100.0
- **Marketplace Ready**: Complete package information with custom icon and keywords
