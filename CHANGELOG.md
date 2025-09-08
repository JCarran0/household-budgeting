# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0](https://github.com/JCarran0/household-budgeting/compare/v1.8.0...v1.9.0) (2025-09-08)


### Features

* **budgets:** improve budget display with currency formatting and cashflow metrics ([871cfee](https://github.com/JCarran0/household-budgeting/commit/871cfee2445af52384d23f96234c5de87e2bd120))


### Bug Fixes

* **admin:** correct dataService access for location cleanup endpoints ([9d3b0b6](https://github.com/JCarran0/household-budgeting/commit/9d3b0b6967e71de8ce4f2a86cd147d737a20c872))

## [1.8.0](https://github.com/JCarran0/household-budgeting/compare/v1.7.0...v1.8.0) (2025-09-07)


### Features

* **budgets:** add income budget hierarchical aggregation support ([bc60731](https://github.com/JCarran0/household-budgeting/commit/bc6073130bcfe870ffdf8a4312cea03c20462e89))
* **budgets:** add income budget tracking with inverse logic ([c701120](https://github.com/JCarran0/household-budgeting/commit/c701120d91f81d10984ebaf4d45d596de167439c))
* **categories:** add clickable transaction counts with preview modal ([788bb81](https://github.com/JCarran0/household-budgeting/commit/788bb81ffc750dd62f0072a80d146ec82bd43fdb))
* **transactions:** add CSV export functionality with filter preservation ([61d1988](https://github.com/JCarran0/household-budgeting/commit/61d1988fdbf7eca11e83ea688b2fb42a7418605d))
* **transactions:** optimize location data storage by removing empty objects ([c3556c5](https://github.com/JCarran0/household-budgeting/commit/c3556c5e3a4e2b4008ea840f82030aa0062e73a3))


### Bug Fixes

* **budgets:** replace window.confirm with Mantine modals for Arc Browser compatibility ([f4c7f7f](https://github.com/JCarran0/household-budgeting/commit/f4c7f7fcef4b604bd24d60a60170e8cb10405b68))
* **deploy:** ensure shared utilities are deployed to root level for import resolution ([68d413d](https://github.com/JCarran0/household-budgeting/commit/68d413daa994f4999e42163b9e88b7e6ee60587a))


### Tests

* **budgets:** fix failing critical tests for budget comparison ([5201f1d](https://github.com/JCarran0/household-budgeting/commit/5201f1d41fe7fcd04e3527c567284a7d32a4c702))

## [1.7.0](https://github.com/JCarran0/household-budgeting/compare/v1.6.0...v1.7.0) (2025-09-07)


### Features

* **budgets:** implement hierarchical budget display with smart parent aggregation ([26e26fa](https://github.com/JCarran0/household-budgeting/commit/26e26fa63b6a010d3d8dc9cfb5505a0a8dcc70b8))


### Bug Fixes

* **categories:** implement hierarchical income detection for budget filtering ([5f79f02](https://github.com/JCarran0/household-budgeting/commit/5f79f0211ad1a3d0c1645a1d52ccce4b60c53ff9))

## [1.6.0](https://github.com/JCarran0/household-budgeting/compare/v1.5.0...v1.6.0) (2025-09-07)


### Features

* **categories:** add transaction count display feature ([4d240c4](https://github.com/JCarran0/household-budgeting/commit/4d240c4d25e09915991924e1859beded442e3726))


### Bug Fixes

* **import:** optimize CSV import to prevent 504 timeouts ([937c7f2](https://github.com/JCarran0/household-budgeting/commit/937c7f2de1054d1cfa0ce3cf9badebdd3c015a8d))
* **reports:** calculate YTD averages using only complete months ([4d2da34](https://github.com/JCarran0/household-budgeting/commit/4d2da34fcf9326b05f0b68a486300801cd7f3fe8))

## [1.5.0](https://github.com/JCarran0/household-budgeting/compare/v1.4.0...v1.5.0) (2025-09-07)


### Features

* **import:** add category-only update mode for matched transactions ([1b0b0db](https://github.com/JCarran0/household-budgeting/commit/1b0b0db788768a86a294bfc584afcf00a9c0a493))
* **import:** add CSV transaction import with duplicate detection ([daacaba](https://github.com/JCarran0/household-budgeting/commit/daacaba1e5e890a9ae5adfd8f2b2fe392d2fdf50))
* **import:** create generalized CSV import framework for multiple use cases ([5d4ab3e](https://github.com/JCarran0/household-budgeting/commit/5d4ab3ea6a43b8c86415ae18cbf5c067b672195e))


### Bug Fixes

* **import:** implement actual category updates and improve matching logic ([694c504](https://github.com/JCarran0/household-budgeting/commit/694c504461d7bb79d3a6c84065954f971370cbcc))


### Documentation

* document generalized CSV import framework architecture ([a765313](https://github.com/JCarran0/household-budgeting/commit/a765313fb8664aa3595361e459aefc263e463898))
* update AI documentation for CSV import feature ([8673427](https://github.com/JCarran0/household-budgeting/commit/8673427112fa0fc1b45d039596591292ae6d9614))


### Code Refactoring

* **categories:** remove hidden categories toggle and improve search performance ([f7873c4](https://github.com/JCarran0/household-budgeting/commit/f7873c44d111daa3ad550c25c56c99bcffa9a134))
* **categories:** rename savings concept to rollover throughout application ([d4d4ada](https://github.com/JCarran0/household-budgeting/commit/d4d4adafd6620041f043d0925320c303c6bc108a))

## [1.4.0](https://github.com/JCarran0/household-budgeting/compare/v1.3.1...v1.4.0) (2025-09-07)


### Features

* **budgets:** enhance copy feature to allow selection from any previous month ([14cb183](https://github.com/JCarran0/household-budgeting/commit/14cb18303e6251b32f4551431a02887008ecc28f))
* **categories:** add CSV import functionality for bulk category creation ([0a9626b](https://github.com/JCarran0/household-budgeting/commit/0a9626b6d32196a54f5fcf92a83d6f0a536f76b6))
* **categories:** add description field with tooltips for categories ([dc9ac7e](https://github.com/JCarran0/household-budgeting/commit/dc9ac7ec82eff8af143a7cde887315133616f656))


### Bug Fixes

* **budgets:** allow deletion of orphaned budgets with unknown categories ([c11f020](https://github.com/JCarran0/household-budgeting/commit/c11f0208f29eb67d7135411ddee55be755d3ead6))
* **reports:** exclude subcategories of hidden parents from all reports ([c6f4a19](https://github.com/JCarran0/household-budgeting/commit/c6f4a1976b9affec2a9de83cd6cc71eafffc1db2))


### Chores

* **dev:** add server management scripts and instructions ([880ed51](https://github.com/JCarran0/household-budgeting/commit/880ed510fc3b9f7032fba3cdfd9dae1ac30403a9))

### [1.3.1](https://github.com/JCarran0/household-budgeting/compare/v1.3.0...v1.3.1) (2025-09-07)


### Bug Fixes

* **api:** correct package.json path in version endpoint for production ([38d178e](https://github.com/JCarran0/household-budgeting/commit/38d178eea7e9aa494a123db0f4502899f9eb0e13))
* **budget:** prevent monthly calculations from including next month's transactions ([97c8bf9](https://github.com/JCarran0/household-budgeting/commit/97c8bf9f2058c1facd5b864a06f03e2c1b23f189))

## [1.3.0](https://github.com/JCarran0/household-budgeting/compare/v1.2.2...v1.3.0) (2025-09-07)


### Features

* **transaction:** add bulk hide/unhide transactions functionality ([c9684f7](https://github.com/JCarran0/household-budgeting/commit/c9684f7d3b8b2b85f9c4934561d060b6e3bf962b))


### Bug Fixes

* **budget:** exclude subcategories of hidden parents from budget calculations ([acb27fc](https://github.com/JCarran0/household-budgeting/commit/acb27fc2f7658481184fb96db152c0fce1c1e1c0))
* **transaction:** implement functional "Hide from budgets" toggle ([9113b67](https://github.com/JCarran0/household-budgeting/commit/9113b67feb83cc88677d155848f8d673096c650f))
* **ui:** restore version display error handling in user menu ([acb7833](https://github.com/JCarran0/household-budgeting/commit/acb7833c19c0afd4c1f0129c51313c1b65884cca))

### [1.2.2](https://github.com/JCarran0/household-budgeting/compare/v1.2.1...v1.2.2) (2025-09-07)


### Bug Fixes

* **deployment:** correct shared utilities path to /home/appuser/app/shared ([6eff7e3](https://github.com/JCarran0/household-budgeting/commit/6eff7e388d328e8bca98a35066703d83248a742c))

### [1.2.1](https://github.com/JCarran0/household-budgeting/compare/v1.2.0...v1.2.1) (2025-09-07)


### Bug Fixes

* **deployment:** include shared utilities in deployment package ([19a6b61](https://github.com/JCarran0/household-budgeting/commit/19a6b617e6c587ae717a54f06b0eb7d0c4e4d3b2))

## [1.2.0](https://github.com/JCarran0/household-budgeting/compare/v1.1.1...v1.2.0) (2025-09-06)


### Features

* **categories:** add deletion protection for categories with dependencies ([7deb472](https://github.com/JCarran0/household-budgeting/commit/7deb4729552b18b28b43c998c4e012d68b8d2b0a))
* **navigation:** add filter synchronization between Reports and Transactions pages ([5505f57](https://github.com/JCarran0/household-budgeting/commit/5505f57d64c482c2fb89b0a5c52418bcd0086c27))
* **reports:** add income category dashboards with drill-down analysis ([edfee8d](https://github.com/JCarran0/household-budgeting/commit/edfee8d1b6a80e700314c751e5ea98415bcf73ca))
* **ui:** add app version display to user profile menu ([6d239c6](https://github.com/JCarran0/household-budgeting/commit/6d239c60f580199bc97964316cb5a2470ca893b1))


### Bug Fixes

* **api:** move version endpoint under API prefix to fix 404 error ([850a2e0](https://github.com/JCarran0/household-budgeting/commit/850a2e016a794dad064eaecd862fa7c730b50894))
* **auto-categorization:** include merchantName in pattern matching to handle punctuation differences ([c7d6705](https://github.com/JCarran0/household-budgeting/commit/c7d6705ac141caa92df35a52e09d2113c57d841c))
* **budget:** exclude income categories from budget tracking ([8a6baed](https://github.com/JCarran0/household-budgeting/commit/8a6baeda228b7cc745a681428bf8172d6b5ea43f))
* **budget:** format budget amounts with commas and no decimals ([01b41c2](https://github.com/JCarran0/household-budgeting/commit/01b41c28cbf5aa1c265d8321986566778835419d))
* **categories:** improve deletion UX with proper status codes and no confirmation ([4b74c29](https://github.com/JCarran0/household-budgeting/commit/4b74c296fab29865b185754788c833ae0d16f71f))
* **reports:** prevent tab reset when toggling income/expense view ([f499053](https://github.com/JCarran0/household-budgeting/commit/f4990539ee3cc3811a55ce71559b11ecb8582524))
* **reports:** use consistent color palette for income and expense views ([e82c0d7](https://github.com/JCarran0/household-budgeting/commit/e82c0d731fe6148d399e3864632ca747536e0764))


### Documentation

* add user story updates as MUST UPDATE criteria in /update-docs command ([f22ebb6](https://github.com/JCarran0/household-budgeting/commit/f22ebb63e0b6c08539bce50800811c39c5cfde7d))
* **architecture:** document income/expense separation pattern for budget system ([fbca169](https://github.com/JCarran0/household-budgeting/commit/fbca16965869f31c7a6755afb6c3a7bc78132c6e))

### [1.1.1](https://github.com/JCarran0/household-budgeting/compare/v1.1.0...v1.1.1) (2025-09-06)


### Bug Fixes

* **auto-categorize:** enable recategorization by adding missing ModalsProvider ([4635c5f](https://github.com/JCarran0/household-budgeting/commit/4635c5fb2ab31398f6a71e90673b7aeebd91441a))
* remove backticks causing permission error in /commit command ([4114dfb](https://github.com/JCarran0/household-budgeting/commit/4114dfb30d7447a63bd5dd643394a2af27ce39d3))
* **ui:** swap arrow icons for income and expenses ([5b9e47a](https://github.com/JCarran0/household-budgeting/commit/5b9e47a8dea4a5e985cc35d97e3c4dca95943578))

## [1.1.0](https://github.com/JCarran0/household-budgeting/compare/v1.0.0...v1.1.0) (2025-09-06)


### Features

* **ci:** run tests and builds before creating releases ([c617285](https://github.com/JCarran0/household-budgeting/commit/c61728522d3fcd304484df47f9bd7758929475a9))


### Tests

* fix all test failures after Plaid PFC implementation ([486c14a](https://github.com/JCarran0/household-budgeting/commit/486c14a91ae6489b10854a0bf6705bae48dda3ff))

## 1.0.0 (2025-09-06)


### ⚠ BREAKING CHANGES

* Complete overhaul of category system to use Plaid's comprehensive taxonomy

Major Changes:
- Replace UUID-based category IDs with SNAKE_CASE IDs matching Plaid's system
- Initialize 121 default categories (120 Plaid + 1 custom savings) instead of 19
- Automatic transaction categorization using Plaid's detailed categories
- Custom categories now use CUSTOM_ prefix with SNAKE_CASE IDs

Implementation Details:
- Added plaidCategories.ts with complete Plaid taxonomy (16 primary, 104 subcategories)
- Updated Category interface to include description and isCustom fields
- Modified transaction sync to directly use Plaid category IDs (zero-mapping approach)
- Fixed hidden category filtering in reports and budgets (Transfer In/Out exclusion)
- Added comprehensive test coverage for Plaid category integration

Benefits:
- Seamless Plaid integration without mapping complexity
- Comprehensive categorization covering all transaction types
- Automatic categorization preserves user overrides
- Hidden categories (Transfer In/Out) properly excluded from financial calculations

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
* **categories:** Renamed transaction category fields for clarity
- `categoryId` → `plaidCategoryId` (Plaid's suggested category)
- `userCategoryId` → `categoryId` (user's assigned category)

This refactoring eliminates confusing dual-field architecture and removes
fallback logic throughout the codebase. The new structure provides clear
separation between Plaid's suggestion and the user's actual category choice.

Changes:
- Updated StoredTransaction interface with renamed fields
- Removed all fallback logic (userCategoryId || categoryId patterns)
- Updated transaction creation to use new field names
- Fixed auto-categorization to only set categoryId
- Removed API route mapping - frontend gets clean categoryId
- Added plaidCategoryId to shared Transaction type
- Created data migration script for existing transactions
- Updated all test fixtures and test files

Benefits:
- Clearer code with no ambiguous fallback patterns
- Frontend/backend consistency
- Preserves Plaid's original suggestion if needed
- Simpler maintenance and debugging

Migration: Run `npx ts-node scripts/migrate-category-ids.ts` to migrate existing data

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
* Existing transactions with old plaid_* category IDs will need re-categorization

Co-Authored-By: Claude <noreply@anthropic.com>
* **categories:** Removes plaidCategory field from categories. Users will need to recreate their categories to use the new system.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
* **budgets:** All budget methods now require userId parameter

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
* **budgets:** Budget service methods now require userId parameter

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>

### Features

* **accounts:** add account disconnect functionality ([80c83a3](https://github.com/JCarran0/household-budgeting/commit/80c83a3a8f723ac64bbb4115add382fcb61de9d4))
* **accounts:** allow users to add custom nicknames to accounts ([8a7e6a1](https://github.com/JCarran0/household-budgeting/commit/8a7e6a117157af7fd614942dd8683b05dd89524d))
* **accounts:** implement account and transaction management ([9ac80a4](https://github.com/JCarran0/household-budgeting/commit/9ac80a40dd2992bc45dc19a543691a53b56f7206))
* add /commit slash command for standardized git commits ([b961b5c](https://github.com/JCarran0/household-budgeting/commit/b961b5c2182a491b29bbeac691b569302dab2f4c))
* add /debug-issue slash command for systematic debugging ([d86badd](https://github.com/JCarran0/household-budgeting/commit/d86badd032960f26eb36df0dedbd31dbeab28cb1))
* add /feature and /task slash commands for development workflows ([c3a0801](https://github.com/JCarran0/household-budgeting/commit/c3a0801134ff6d8f6238d586e596d37af90d1bb5))
* add /improve slash command for infrastructure and tooling improvements ([f06fe3e](https://github.com/JCarran0/household-budgeting/commit/f06fe3e9ab4c681787be97a52c1783868f454f98))
* add /review-tests slash command for test strategy compliance ([c965688](https://github.com/JCarran0/household-budgeting/commit/c965688879e2ebc2be6158d8accbf01c316d60a2))
* add /update-docs slash command and relocate commands to root ([c3ecc9d](https://github.com/JCarran0/household-budgeting/commit/c3ecc9d011d1f1ab67f041f3ed62b79c560d2924))
* add app reset script for development ([5ec9747](https://github.com/JCarran0/household-budgeting/commit/5ec97473961728321865e97eff9ef5122b138906))
* add editable transaction descriptions and auto-categorization foundation ([7478905](https://github.com/JCarran0/household-budgeting/commit/747890523d6e43304204b1be7ccc916be79fc84e))
* add integrated release and deployment workflow ([0c93afc](https://github.com/JCarran0/household-budgeting/commit/0c93afc6c80351d4aff4f7c8afe945475eff2a34))
* add manual sidebar toggle for desktop view ([9d024c3](https://github.com/JCarran0/household-budgeting/commit/9d024c3548d64572b5001402510c2af8af0a6d4f))
* add React frontend with Plaid integration ([de2b91c](https://github.com/JCarran0/household-budgeting/commit/de2b91c4602b88c8c646d9b916f380fa929e7836))
* add uncategorized transactions alert to transactions page ([7e13f56](https://github.com/JCarran0/household-budgeting/commit/7e13f56e6a1c1cc710dbd51a7ef66d1869b1cc0b))
* add workflow to update server deployment scripts ([ca5a39c](https://github.com/JCarran0/household-budgeting/commit/ca5a39c1befc06f0408b537df8bb0656a264048b))
* **api:** add Express application with auth routes ([26acc98](https://github.com/JCarran0/household-budgeting/commit/26acc982c3075435c02c17027c96d2267e12802c))
* **auth:** add input validation and authentication middleware ([798c183](https://github.com/JCarran0/household-budgeting/commit/798c1831f9bedcbd6e93757095a5b97f549b535a))
* **auth:** implement authentication service with TDD approach ([1149d8b](https://github.com/JCarran0/household-budgeting/commit/1149d8b8c17534da16928fc7787d1fc599822178))
* **auth:** implement passphrase-based authentication and UX improvements ([d46d15e](https://github.com/JCarran0/household-budgeting/commit/d46d15e3a9b0cff76c8a4396583157d2cc5af9af))
* **auto-categorization:** add user description support to rules ([5852c80](https://github.com/JCarran0/household-budgeting/commit/5852c80a9994dd467594fe6720e8162a415382de))
* **backend:** implement reporting service (Phase 5.3) ([8955d5c](https://github.com/JCarran0/household-budgeting/commit/8955d5c967a1059bff0a1f2386b444fa54c8678a))
* **budgets:** implement monthly budget management system ([865711d](https://github.com/JCarran0/household-budgeting/commit/865711d8bc59a6e46f593d91f747c5df6b2b6d9a))
* **budgets:** implement user-scoped budget isolation ([9432757](https://github.com/JCarran0/household-budgeting/commit/94327572c9c7da2ff3cdd3f1699d5aae566f9879))
* **categories:** add OR logic for auto-categorization rules with multiple patterns ([4863a72](https://github.com/JCarran0/household-budgeting/commit/4863a722641cb525538d08eb5513d3e0d83e3099))
* **categories:** add re-categorization feature with orphaned ID handling ([4c4ac79](https://github.com/JCarran0/household-budgeting/commit/4c4ac790ebe90c20dedc92fa68fdb5c850e35e60))
* **categories:** allow hidden categories in transaction UI while excluding from budgets ([1dcb836](https://github.com/JCarran0/household-budgeting/commit/1dcb836867c9cca6c6c42fbe12e5db4573911d75))
* **categories:** implement category management system ([f68acfa](https://github.com/JCarran0/household-budgeting/commit/f68acfa171891e52418ddeef34b0618da6081db8))
* **categories:** implement Plaid category fallback in auto-categorization ([c3cb07c](https://github.com/JCarran0/household-budgeting/commit/c3cb07cae9e68e7b801ab6cf2803672807a221b9))
* Changes login prompt for testing ([fa7022e](https://github.com/JCarran0/household-budgeting/commit/fa7022e6fb15a4c5703c2c8e60feb691114b4308))
* **ci/cd:** implement AWS Systems Manager deployment (no SSH required) ([857ebd1](https://github.com/JCarran0/household-budgeting/commit/857ebd1657a4d9789a08c2e88d0e87adb4d1de3d))
* **ci/cd:** implement GitHub Actions CI/CD pipeline ([9178011](https://github.com/JCarran0/household-budgeting/commit/9178011c5b12f36cf8dfaf5bde32f128f5137b04))
* complete auto-categorization UI with rule management ([c5784c3](https://github.com/JCarran0/household-budgeting/commit/c5784c340eba6328a7b9bb21fdff764e82775256))
* consolidate dataService and prepare for S3 storage migration ([c8886ba](https://github.com/JCarran0/household-budgeting/commit/c8886ba8d22fdba754e0206c54fb19b71cbe8753))
* **dashboard:** add number formatting with tooltips for financial amounts ([e9d303a](https://github.com/JCarran0/household-budgeting/commit/e9d303a4d793cc69c16504a419580b156fda2569))
* **deploy:** manage environment variables through GitHub Secrets ([1c3275c](https://github.com/JCarran0/household-budgeting/commit/1c3275c00a5e6942a18c54c91c39ebeb27152116))
* **frontend:** implement category and budget management UI ([aeb7c9c](https://github.com/JCarran0/household-budgeting/commit/aeb7c9c1d927372e9b8c1a957db39e53e6558448))
* **frontend:** implement comprehensive reporting dashboard ([98b80a4](https://github.com/JCarran0/household-budgeting/commit/98b80a4eafe65b4475e56a3a10677a8418125f93))
* implement persistent filter caching for user preferences ([065c5f5](https://github.com/JCarran0/household-budgeting/commit/065c5f5f15ab9a325effa3007a3032edd6653767))
* implement Plaid Personal Finance Categories (PFC) taxonomy ([3d2509e](https://github.com/JCarran0/household-budgeting/commit/3d2509e0c369a0207613e918b229408d1b822c3b))
* implement semantic versioning with rolling changelog ([bc8a135](https://github.com/JCarran0/household-budgeting/commit/bc8a135524f520cfe159a76ba85af2db468e988c))
* optimize transactions page caching and loading states ([8a458b0](https://github.com/JCarran0/household-budgeting/commit/8a458b0fcd9ad4998c89f89ee20033ec71692adb))
* **plaid:** implement Plaid service with sandbox integration ([0e0dda6](https://github.com/JCarran0/household-budgeting/commit/0e0dda6e65a87b2f00ea73ac42f67d44cbb7fc27))
* replace manual versioning with standard-version ([85a18b2](https://github.com/JCarran0/household-budgeting/commit/85a18b261229596481249944b4856049442db2c2))
* **reports:** add interactive drill-down to Category Breakdown pie chart ([77c40a5](https://github.com/JCarran0/household-budgeting/commit/77c40a5a881817511bf2941990b4950baf47d8be))
* **reports:** add This Month and This Year date range options ([4f510d3](https://github.com/JCarran0/household-budgeting/commit/4f510d3b08d53e2dc86adc5002d7bbb4ff9ec105))
* **reports:** add transaction preview with drill-down navigation ([bee31c3](https://github.com/JCarran0/household-budgeting/commit/bee31c3d06890f452cc2d5ce170a4ba3c851ffef))
* round up financial values and remove decimals on Reports page ([daa2a03](https://github.com/JCarran0/household-budgeting/commit/daa2a03bd8f09d94d1a08e2cfd4f31407afbc2b4))
* **scripts:** add S3 support to reset script ([ff8bd0d](https://github.com/JCarran0/household-budgeting/commit/ff8bd0df0793eb9e47651a084cdf0669d9c555b3))
* **security:** implement AES-256-GCM encryption for Plaid access tokens ([bcc9799](https://github.com/JCarran0/household-budgeting/commit/bcc9799ebeb8359a1f17ee96e866dc40b14ab63a))
* **ssl:** configure HTTPS with Let's Encrypt for budget.jaredcarrano.com ([3ae37ec](https://github.com/JCarran0/household-budgeting/commit/3ae37ecacf464f1cc53a57fb9df6d869d1492719))
* **storage:** implement flexible storage system with S3 support ([44d04b8](https://github.com/JCarran0/household-budgeting/commit/44d04b8d349bd5a0c4c3be854b43d508bdbef367))
* **terraform:** add AWS infrastructure configuration for production deployment ([672058a](https://github.com/JCarran0/household-budgeting/commit/672058a5e90330614e55557a40e4ae9258d309af))
* **testing:** implement user story focused testing framework ([d77831f](https://github.com/JCarran0/household-budgeting/commit/d77831fff88ca500a70191cb107a7711276b53cd))
* **transactions:** add bulk edit capability for transactions ([a5423b7](https://github.com/JCarran0/household-budgeting/commit/a5423b7447f25cd03c0313e5eb2dc30331cca8f5))
* **transactions:** add enhanced transaction management UI ([b048759](https://github.com/JCarran0/household-budgeting/commit/b0487598fdc03dcc78bf5f294b6aa52e8fdc2034))
* **transactions:** add exact amount search with tolerance ([5c4944e](https://github.com/JCarran0/household-budgeting/commit/5c4944ef10629f2eb026102710ff19ad01bc22ed))
* **transactions:** add income vs expense filter to transactions table ([91dba75](https://github.com/JCarran0/household-budgeting/commit/91dba75d3e8e41ca8e5023e9b760fe17bd88efd5))
* **transactions:** add inline category editing ([08ae6d5](https://github.com/JCarran0/household-budgeting/commit/08ae6d5c29dc6cee6e12b4c989834119fe79f5c5))
* **transactions:** enhance UI/UX with improved filters and display ([c67c9bf](https://github.com/JCarran0/household-budgeting/commit/c67c9bf68e6a9091f3457124dbf6504e3848d2ec))
* **transactions:** implement transaction splitting functionality ([354dc9d](https://github.com/JCarran0/household-budgeting/commit/354dc9dca1df92f04efd2a9d44511215694753b5))
* **ui:** complete Mantine UI framework migration ([a6260ff](https://github.com/JCarran0/household-budgeting/commit/a6260ffb58943839e12fa78de326de7fcca5623a))
* **ui:** implement comprehensive error boundary system ([7318971](https://github.com/JCarran0/household-budgeting/commit/731897128aa64a0a66eafe537c88b0cc4282be7a))
* **ui:** integrate Mantine UI framework for professional dashboard ([38a5a64](https://github.com/JCarran0/household-budgeting/commit/38a5a644da1959ee3a0a8c81cafd43a3c81fde4f))


### Bug Fixes

* adjust script paths for flattened production deployment ([aa5be91](https://github.com/JCarran0/household-budgeting/commit/aa5be913fe1c43d181740eb5f9b89df108846619))
* **auth:** clear React Query cache when switching users ([a7cf934](https://github.com/JCarran0/household-budgeting/commit/a7cf93451297f9fc0808dbbd928d55a7da92b5f7))
* **auth:** resolve rate limiting conflicts in test environment ([235e98b](https://github.com/JCarran0/household-budgeting/commit/235e98b8bd337117f17b0def869393c09f041fd1))
* **backend:** add production domain to CORS allowed origins ([6676a2a](https://github.com/JCarran0/household-budgeting/commit/6676a2afe593b7ec9a7f8b2bb6f4f4cae874a049))
* **budgets:** resolve infinite loop when creating budgets ([32088a6](https://github.com/JCarran0/household-budgeting/commit/32088a6e5d51299a5662cabe1642b1d1046de19f))
* **budgets:** resolve invalid HTML structure in BudgetGrid table ([d3a8a08](https://github.com/JCarran0/household-budgeting/commit/d3a8a0813591a70d5b78913aaf491620a8db6b48))
* **bulk-edit:** resolve duplicate option error and simplify description modes ([595c876](https://github.com/JCarran0/household-budgeting/commit/595c876cf3c7cb5b5be525f829bf92457d939389))
* **categories:** implement proper user-specific data isolation ([ed552e7](https://github.com/JCarran0/household-budgeting/commit/ed552e72ed27be83c8d4492f06ef861275dab4df))
* **categories:** resolve initialization button error and improve error handling ([d8d60b1](https://github.com/JCarran0/household-budgeting/commit/d8d60b11a75da050568cca7fe5649cb8a2c268b2))
* **ci/cd:** fix production build by installing all dependencies during build phase ([bef596d](https://github.com/JCarran0/household-budgeting/commit/bef596d497ce02a868e657e5e7dd02908b3e70f6))
* **ci/cd:** improve SSH connection handling in workflows ([c7b5827](https://github.com/JCarran0/household-budgeting/commit/c7b582774ccd1c47fd6c2ff98470aaae46be7fc1))
* **ci:** avoid GitHub secret masking for S3 deployment path ([a739dd3](https://github.com/JCarran0/household-budgeting/commit/a739dd38f7262b6bb50eff4eeeae3010a36cb1b5))
* **ci:** resolve S3 path substitution in SSM deployment ([c72626b](https://github.com/JCarran0/household-budgeting/commit/c72626b4dd3e1bee2e4fdee90ae8008ba32d1a3f))
* **ci:** resolve SSM deployment issues ([4eb5efe](https://github.com/JCarran0/household-budgeting/commit/4eb5efe368eb9ec192c838db215adfef3ef26c9f))
* **ci:** resolve SSM variable scope issue with script approach ([1d9ca8b](https://github.com/JCarran0/household-budgeting/commit/1d9ca8bbd0d1a18cbd9726f8c187b2110cdaee71))
* correct deploy script PM2 path and env handling ([1ed1271](https://github.com/JCarran0/household-budgeting/commit/1ed1271abc17cf2506558cb74abee3c01f24947c))
* correct PM2 start path for TypeScript compiled output ([40c817c](https://github.com/JCarran0/household-budgeting/commit/40c817ce94a432bd7c8e7f614445896f0cd5396d))
* critical bug - prevent removing transactions from other accounts during sync ([c870554](https://github.com/JCarran0/household-budgeting/commit/c870554daf9d7da413cf62568477141553061de3))
* **dashboard:** correct budget status calculation to use actual budgets ([e691a21](https://github.com/JCarran0/household-budgeting/commit/e691a21a2e6afed58df4b705e9d011d02471d4a6))
* **deploy:** correct PM2 startup path for nested dist structure ([db85ff0](https://github.com/JCarran0/household-budgeting/commit/db85ff017da2c29785cd770a27dcfdc78357f34a))
* **deploy:** preserve dist directory structure in deployments ([fd3f554](https://github.com/JCarran0/household-budgeting/commit/fd3f554538a7c8ab640586b21b189336633c3d9b))
* **deploy:** update server scripts workflow to use dist/index.js ([656dd45](https://github.com/JCarran0/household-budgeting/commit/656dd45554905c0571939bd0c7db8036bb179847))
* **deploy:** use appuser home directory instead of /tmp ([50989a1](https://github.com/JCarran0/household-budgeting/commit/50989a1fae34104f2d12fa0e3fa3d715aca77895))
* disable broken changelog automation and clean up duplicates ([0c7044c](https://github.com/JCarran0/household-budgeting/commit/0c7044ceddba3efd7ed3a7326751e2b125327d3b))
* **frontend:** resolve category selector issues in forms ([e42e213](https://github.com/JCarran0/household-budgeting/commit/e42e213f1f793f1d22a72d415402b6f9393211a2))
* **frontend:** resolve React hooks ESLint warnings ([d6156dc](https://github.com/JCarran0/household-budgeting/commit/d6156dc6dc9f8d78edf930d73bb11b394c5b242a))
* **frontend:** use relative API URL in production ([430c24b](https://github.com/JCarran0/household-budgeting/commit/430c24b735fc98cb67f47ab5d0495c8acb8c37f0))
* handle decryption errors gracefully during sync ([9530c4a](https://github.com/JCarran0/household-budgeting/commit/9530c4a91fef62daf1e2ea44c5b2f6362bbf6509))
* handle plain text tokens from pre-encryption era ([18cbbcd](https://github.com/JCarran0/household-budgeting/commit/18cbbcd39338e10da535aa161e863d5644832f40))
* **plaid:** ensure Items are properly removed on disconnect for full transaction history ([42a3575](https://github.com/JCarran0/household-budgeting/commit/42a3575be89be0727abf256b1b8fd2d0451eab6e))
* **plaid:** resolve 400 error when connecting bank accounts ([4611e3d](https://github.com/JCarran0/household-budgeting/commit/4611e3d868c4b493bb099dc4a5c9a1d4cfc84a4a))
* prevent infinite loop in CategoryForm useEffect ([c58f117](https://github.com/JCarran0/household-budgeting/commit/c58f1176aa4e5ef4c25ca30d1e80f1814fc35caa))
* properly copy dist contents to avoid duplicated backend directory ([87a6dbd](https://github.com/JCarran0/household-budgeting/commit/87a6dbd4eed2a58f77eb1df16c85561d7f490643))
* remove automatic transaction sync on account connection ([c5d31e5](https://github.com/JCarran0/household-budgeting/commit/c5d31e5c8c6feb2b3efcf32418a714c4598928bb))
* remove unused imports in AutoCategorization component ([56e9c9c](https://github.com/JCarran0/household-budgeting/commit/56e9c9c111e91c821127755aa853f1aa3bb1bf8b))
* **reports:** correct category data access and chart rendering issues ([a89c515](https://github.com/JCarran0/household-budgeting/commit/a89c51585dcfe2f2084e5e45d312c6b5966f9de5))
* **reset:** update reset script to handle user-scoped data files ([5dbb804](https://github.com/JCarran0/household-budgeting/commit/5dbb804b4b86ab32f28f2f4540b48f511183b2d5))
* resolve all ESLint and TypeScript linting errors ([695bb00](https://github.com/JCarran0/household-budgeting/commit/695bb0038d2b97387479ca43c505635bccf46d55))
* resolve all TypeScript build errors in frontend ([d69b27a](https://github.com/JCarran0/household-budgeting/commit/d69b27a95dafa7eb5fb37f324699b619b51fa8d8))
* resolve PM2 environment loading issue in production ([92b1161](https://github.com/JCarran0/household-budgeting/commit/92b116137b3862a90ba96c6b7d996b97c00a2efb))
* resolve React Fast Refresh warning and TypeScript errors ([1cd3954](https://github.com/JCarran0/household-budgeting/commit/1cd395434a383daa78a0d35dc013fa181bafc992))
* resolve transaction page performance issues with pagination ([737d5ea](https://github.com/JCarran0/household-budgeting/commit/737d5ea3605bfd474d370955fd37ff87da53591e))
* resolve TypeScript build duplicating backend directory in dist output ([663f46d](https://github.com/JCarran0/household-budgeting/commit/663f46d2a8ad514fbbb8761b872da7002fb424ee))
* resolve TypeScript strict mode errors ([ca86087](https://github.com/JCarran0/household-budgeting/commit/ca8608760f00d2986afcbb4d620aa0330749e9ce))
* sync package.json versions and use root version as source of truth ([505485b](https://github.com/JCarran0/household-budgeting/commit/505485b095447f52bfd1ca9214be1de1a833d58f))
* **testing:** resolve test failures with username validation and troubleshooting docs ([5c21b09](https://github.com/JCarran0/household-budgeting/commit/5c21b09f68ccbef1cc8f80a4f90de199372fc8d2))
* **transactions:** correct transaction count display to show proper totals ([41eac22](https://github.com/JCarran0/household-budgeting/commit/41eac22f83f33e2d2376416206255dbc04454f51))
* **transactions:** fix category filter not working for uncategorized transactions ([8ab2b96](https://github.com/JCarran0/household-budgeting/commit/8ab2b96a47b8950106560b2eec9610bde39abf4f))
* **transactions:** implement pagination and extend history to 2 years ([0e5c011](https://github.com/JCarran0/household-budgeting/commit/0e5c011cbdd2d9a948130167da4033c7d802d6d4))
* **transactions:** implement smart default date filtering ([d168765](https://github.com/JCarran0/household-budgeting/commit/d16876542fdb3a92184f7cbc07c49ff2d504c816))
* **transactions:** implement working transaction edit with tags ([cb1ae7e](https://github.com/JCarran0/household-budgeting/commit/cb1ae7ec8d856d9ba52b20a4a5e12c9c16499654))
* **transactions:** remove pending filter and fix account filtering ([3c72cf0](https://github.com/JCarran0/household-budgeting/commit/3c72cf02748c8f8ab76353d40fa5481c3eda1ddd))
* **transactions:** resolve hooks error when filtering by date ([2d11f82](https://github.com/JCarran0/household-budgeting/commit/2d11f82aa5ae0381cbbd6f894a29358afeaea523))
* **transactions:** resolve icon import and API parameter issues ([ce23d7b](https://github.com/JCarran0/household-budgeting/commit/ce23d7b9e9b571e0c1dd98b88ef2a3b58d16abce))
* **transactions:** resolve menu action bugs and improve split descriptions ([2333b84](https://github.com/JCarran0/household-budgeting/commit/2333b8439613efd19c5e70f00c140d44c1266a99))
* **typescript:** resolve VSCode Jest type recognition issues ([fce781c](https://github.com/JCarran0/household-budgeting/commit/fce781c73f56f2016e6242c6a27e40416bf5fccf))
* **ui:** resolve TypeScript and Mantine compatibility issues in error boundaries ([b014a15](https://github.com/JCarran0/household-budgeting/commit/b014a1556e37e7a65f4ca1b355c6a1b56d19c1ea))
* update deploy workflow comment for clarity ([ca8786e](https://github.com/JCarran0/household-budgeting/commit/ca8786e62c7c773979b8c6a8bb8294a03e9cc52c))
* update PM2 start paths in deployment scripts to match new build output ([5bf2915](https://github.com/JCarran0/household-budgeting/commit/5bf2915a28e9fd1980fc2b54554b87eee9a49910))
* update reset script for production use ([0f27372](https://github.com/JCarran0/household-budgeting/commit/0f2737205f47a58409bac39372f096252dc68b69))
* update slash commands to use @ prefix for file references ([16086a8](https://github.com/JCarran0/household-budgeting/commit/16086a89b15fbe02df0985a7041a2f3ca509d3e0))
* use appuser home directory for deployment temp files ([5fc112f](https://github.com/JCarran0/household-budgeting/commit/5fc112fd34c5accc137fcd2522672243ea8c7113))


### Build System

* add pre-commit hook for automatic linting ([52b1887](https://github.com/JCarran0/household-budgeting/commit/52b1887043d10801c1fa7d79e2ef7cfa1a4e781b))
* add TypeScript type checking to pre-commit hook ([9a0935c](https://github.com/JCarran0/household-budgeting/commit/9a0935c6d3100ea4e7c02a4e97e3dcbc7b1fb22c))


### Tests

* add critical path tests for transaction synchronization ([5b02df1](https://github.com/JCarran0/household-budgeting/commit/5b02df1d354cf989574561705e4b9ce20ae82aa7))
* **api:** add integration tests for Express app ([fd3e904](https://github.com/JCarran0/household-budgeting/commit/fd3e904a9b3a1ece3a35bcefb2ced1d16fabc1a8))
* **auto-categorization:** add comprehensive integration tests ([7835164](https://github.com/JCarran0/household-budgeting/commit/7835164d53ce04647f93144eb9cef9c23d9fe5c0))
* **backend:** add critical tests for hidden category functionality ([6918408](https://github.com/JCarran0/household-budgeting/commit/6918408571bc0c3c63d91bb32e534c957ce7ce5c))
* **budgets:** update tests for user isolation requirements ([186fefb](https://github.com/JCarran0/household-budgeting/commit/186fefb70a01a451b850c639398866cb4ac44548))
* **categories:** add comprehensive category management tests ([52651a8](https://github.com/JCarran0/household-budgeting/commit/52651a88b93627275d33c7cfcef253ae62c3d4fb))
* **financial:** add comprehensive financial calculation story tests ([173ae08](https://github.com/JCarran0/household-budgeting/commit/173ae08cc5764d95f1a64cf3e14a1e506934dab1))
* fix category and budget creation in tests ([6ae4819](https://github.com/JCarran0/household-budgeting/commit/6ae4819d63db68044e5229ae44a6c066f7c19eb0))
* **search:** add comprehensive search and filtering tests ([30389e1](https://github.com/JCarran0/household-budgeting/commit/30389e1a985c9a81c1f999d9a8f94947c4e5a921))
* **transactions:** add comprehensive tests for inline category editing ([b262fbf](https://github.com/JCarran0/household-budgeting/commit/b262fbfbbc23641af318de21048c4037eebdb6da))


### Code Refactoring

* **budgets:** enforce user isolation and remove legacy budget methods ([c7a77f5](https://github.com/JCarran0/household-budgeting/commit/c7a77f581638e0f00830d5cafd5d5b4f0af9b8a0))
* **categories:** clean up category ID architecture ([24f4520](https://github.com/JCarran0/household-budgeting/commit/24f4520441d1f4feb745cceb328840032d2af3cf))
* **categories:** improve visual presentation of hidden categories ([b72f70f](https://github.com/JCarran0/household-budgeting/commit/b72f70f2495b928c39025f4e3f230ab34c361509))
* **categories:** replace plaidCategory mapping with system categories ([b073c77](https://github.com/JCarran0/household-budgeting/commit/b073c77446e459cb5344ce4b77652dfeb39585a9))
* **ci/cd:** change deployment to manual trigger only ([003f49e](https://github.com/JCarran0/household-budgeting/commit/003f49efa3a7dc23aed8852ceec146f16e09c6fd))
* **ci:** simplify deployment with server-side script ([eb97ffb](https://github.com/JCarran0/household-budgeting/commit/eb97ffbb8544234349e82daa72c7feb3aad17ac3))
* **deploy:** migrate non-sensitive configs to GitHub Variables ([47222cd](https://github.com/JCarran0/household-budgeting/commit/47222cda62841f51e00249edb532706b6695f7c9))
* make userId required for category methods ([2df4cfd](https://github.com/JCarran0/household-budgeting/commit/2df4cfd68493b4ecd3a06afe0346888006b7e329))
* remove legacy categories.json and budgets.json files ([f8a402f](https://github.com/JCarran0/household-budgeting/commit/f8a402f7e60d269ea8cd13f1d69a8180ce774a50))
* **reports:** improve TypeScript types and code organization ([5a59ba5](https://github.com/JCarran0/household-budgeting/commit/5a59ba52593f42a7113885a19f722089d105f1eb))
* simplify category system to use regular user categories ([8f841b9](https://github.com/JCarran0/household-budgeting/commit/8f841b91b5a934fd030da7db539e0daecbc2060e))
* streamline CLAUDE.md and remove redundancy with architecture doc ([2ee47ff](https://github.com/JCarran0/household-budgeting/commit/2ee47ff8fa9a4164d29bedf82499a858d9d607b6))
* **typescript:** enforce strict mode with zero any types ([980a0c4](https://github.com/JCarran0/household-budgeting/commit/980a0c498244da7c8e81f40913ba7a5b99cc3bac))


### Chores

* **backend:** configure TypeScript, Jest, and development environment ([0e770d4](https://github.com/JCarran0/household-budgeting/commit/0e770d46564c0dc97703059b0d64433ec7092eb5))
* ignore test-data directory ([5fbdfb7](https://github.com/JCarran0/household-budgeting/commit/5fbdfb7b6282ec104e70ab2c301dfea831a25ca1))
* ignore TypeScript build artifacts in shared/types ([93bc6b6](https://github.com/JCarran0/household-budgeting/commit/93bc6b68a4082b2769acd45738e6aea0606868b0))
* remove console.log statements from frontend ([3255150](https://github.com/JCarran0/household-budgeting/commit/3255150bf4ab9cf4869b6a13dafb17bdc76283fc))
* remove debug logging from auto-categorization ([71294a1](https://github.com/JCarran0/household-budgeting/commit/71294a11e699ba93e1755301aab03018ca412348))
* remove temporary manual test scripts and update docs ([85d153f](https://github.com/JCarran0/household-budgeting/commit/85d153f413304cced5c9d2cd79d6865732afd9c0))
* silence dotenv warnings in test environment ([1683d3f](https://github.com/JCarran0/household-budgeting/commit/1683d3f3416ed4987565b7c7e4c5f2ff27879ced))
* update changelog [skip ci] ([1ac8faa](https://github.com/JCarran0/household-budgeting/commit/1ac8faaf61af7ad0c1326d8ed0725e8c576c1fd8))
* update changelog [skip ci] ([4bfe071](https://github.com/JCarran0/household-budgeting/commit/4bfe071337943582fe5a6d56829b615edd2d43a7))
* update changelog [skip ci] ([57336ee](https://github.com/JCarran0/household-budgeting/commit/57336ee8955cd54fabb85863475d9f8f374e4387))
* update changelog [skip ci] ([df9774e](https://github.com/JCarran0/household-budgeting/commit/df9774e1e6b6ea33f869194485b0bee729c8f124))
* update changelog [skip ci] ([8b154cc](https://github.com/JCarran0/household-budgeting/commit/8b154cca9fa5936d205adb5cc39475473f31a893))
* **vscode:** configure TypeScript and Jest settings ([c068051](https://github.com/JCarran0/household-budgeting/commit/c06805158f97b6331da5f1f2eed87a0b4dd17ffc))


### Documentation

* add account nickname feature to user stories ([86e8a86](https://github.com/JCarran0/household-budgeting/commit/86e8a866cc647454a689603b41b03166ce163d63))
* add comment clarifying backend dist structure is pre-flattened ([5dbd922](https://github.com/JCarran0/household-budgeting/commit/5dbd922d7399093ca7bab7a0710c7def4c6c8a42))
* add comprehensive AI application architecture guide ([77949b9](https://github.com/JCarran0/household-budgeting/commit/77949b940b3630f575933a172304630f48e64eed))
* add comprehensive linting documentation ([a5baeee](https://github.com/JCarran0/household-budgeting/commit/a5baeeed605c6201bfea264e44eb7fa150d8047f))
* add deployment config and Plaid troubleshooting to CLAUDE.md ([251a9be](https://github.com/JCarran0/household-budgeting/commit/251a9be19987e5f5e25ba3aa4ade102a5ad71444))
* add deployment lessons learned and validation commands ([01ac7ee](https://github.com/JCarran0/household-budgeting/commit/01ac7ee8177dc55ec114360c4cda742f02bf44f8))
* add production architecture plan and update project roadmap ([c9000a0](https://github.com/JCarran0/household-budgeting/commit/c9000a0b037d8ffcde02bf7fb7ee9406c6f0d082))
* add production server SSH access details to CLAUDE.md ([210294c](https://github.com/JCarran0/household-budgeting/commit/210294cee13d88a1dec10c8c339aa5f5ee1b2a54))
* add reference to AI-TESTING-STRATEGY.md in CLAUDE.md ([3727118](https://github.com/JCarran0/household-budgeting/commit/372711891e700394d9d68e53e5abe96f36dc6121))
* add reference to AI-USER-STORIES.md as product requirements baseline ([d61a5a9](https://github.com/JCarran0/household-budgeting/commit/d61a5a97d7c1ddaf50529ab5a899aa7c6dab0462))
* add versioning information to README ([013355c](https://github.com/JCarran0/household-budgeting/commit/013355c8908c81cf37a4e1b9ab216756e5f184b4))
* clarify dual-purpose S3 bucket usage and fix IAM policy ([62b164a](https://github.com/JCarran0/household-budgeting/commit/62b164aa328307d20d25385d19e66456a2720dd4))
* extract deployment documentation to dedicated guide ([3178d56](https://github.com/JCarran0/household-budgeting/commit/3178d56934bb096690679f898cf36380ab7a253e))
* fix incorrect deployment trigger documentation ([14db38c](https://github.com/JCarran0/household-budgeting/commit/14db38c3489f0edfc12b31410d3934fe32dcdf6a))
* optimize AI agent documentation structure and navigation ([85d3f61](https://github.com/JCarran0/household-budgeting/commit/85d3f61fccef9831fdda1504d290c983c914ca9d))
* remove TDD references from documentation ([aeb944e](https://github.com/JCarran0/household-budgeting/commit/aeb944eabb4ff801dd2e9750b087979baa31ba5c))
* **security:** add comprehensive security documentation and policies ([8ba0f4a](https://github.com/JCarran0/household-budgeting/commit/8ba0f4afd83dbe38f1c8fba81f2b5be8ad850527))
* **terraform:** add GitHub Actions SSH access documentation ([a6ef212](https://github.com/JCarran0/household-budgeting/commit/a6ef21252ecce64f3c6aff48d688b4227d7bcd9f))
* **testing:** update test counts and add category filter bug fix lesson ([3ec1111](https://github.com/JCarran0/household-budgeting/commit/3ec1111de5af6b26811abc23e66e74822661ba15)), closes [#14](https://github.com/JCarran0/household-budgeting/issues/14)
* update AI documentation with versioning and release workflows ([8c51727](https://github.com/JCarran0/household-budgeting/commit/8c51727c91bc55f969de046fa0062c5e4634a559))
* update architecture and lessons learned ([56ade49](https://github.com/JCarran0/household-budgeting/commit/56ade49d368545b1e0e38b2585be5640dd4c5dd1))
* update architecture guide with recent feature implementations ([3d1ae47](https://github.com/JCarran0/household-budgeting/commit/3d1ae47739aa6a36902bbf7e22143de2090f8094))
* update architecture plan to reflect production reality ([1973897](https://github.com/JCarran0/household-budgeting/commit/1973897ff301dd45e779eec96a69ab23a28eafab))
* update architecture plan with completed CI/CD milestone ([d7bed27](https://github.com/JCarran0/household-budgeting/commit/d7bed279556d6cc0a332b4450355d67674dcfdd0))
* update CLAUDE.md with Plaid PFC migration notes and breaking changes ([7827ca5](https://github.com/JCarran0/household-budgeting/commit/7827ca5c79432a1e5eaf522a6d337f53f739b57a))
* update deployment documentation for SSM workflow ([4dd7f50](https://github.com/JCarran0/household-budgeting/commit/4dd7f50c16264498ed15039cf436ec536af5cb3b))
* update documentation with lessons learned and project status ([1213b40](https://github.com/JCarran0/household-budgeting/commit/1213b407aba3fe8a5092e25221af82cbcd0c4976))
* update documentation with production deployment details ([6062232](https://github.com/JCarran0/household-budgeting/commit/6062232f6929bc88ce8b93212ff50445ca6a7ab3))
* update project documentation to reflect completed features ([e309b81](https://github.com/JCarran0/household-budgeting/commit/e309b813875909cf4708002d1ddb3439be0cb228))
* update project plan to reflect completed Phase 1 ([9b4cca6](https://github.com/JCarran0/household-budgeting/commit/9b4cca62d2078e6357ac64a76fc66b3c172bb6d2))
* update PROJECT_PLAN.md to reflect completed reporting features ([04724e2](https://github.com/JCarran0/household-budgeting/commit/04724e27b1e1bcfd92cb5c7b185ff4ad79bfb28e))
* update PROJECT_PLAN.md with completed phases ([a4a07df](https://github.com/JCarran0/household-budgeting/commit/a4a07df09cbbbbd93220361fa4e77da0db1d9445))
* update PROJECT_PLAN.md with multi-user collaboration and recent completions ([b1ecd9e](https://github.com/JCarran0/household-budgeting/commit/b1ecd9e1a46037eb8ef1b0bd78321dd4f5432734))
* update test coverage for search/filtering completion ([07e050f](https://github.com/JCarran0/household-budgeting/commit/07e050fb15d96470d2e4d0102e9a8169467d4ac1))
* update test coverage status to reflect actual implementation ([cc257ee](https://github.com/JCarran0/household-budgeting/commit/cc257ee2f1b54b24e1b0ff71b74a4fa68c31961c))
* update testing strategy with budget service implementation ([461c3a0](https://github.com/JCarran0/household-budgeting/commit/461c3a04c06a8cdb1bc6313739645928b5474804))
* update testing strategy with encryption implementation ([f495e05](https://github.com/JCarran0/household-budgeting/commit/f495e056e06b8b9ae9a0819a96fc66f46369e818))
* update testing strategy with overmocking lessons learned ([2e6a340](https://github.com/JCarran0/household-budgeting/commit/2e6a3402b2dfe33ab9ecb7ce06a67244ecce7129))
* update user stories to reflect system categories approach ([85feaf3](https://github.com/JCarran0/household-budgeting/commit/85feaf3615f0c68209f6dd6f7c0a182249616560))
* update user stories with exact amount search capabilities ([e89cbf9](https://github.com/JCarran0/household-budgeting/commit/e89cbf99d1acbb6a5768fdbda9e8a4ffbd530545))
* update user stories with new features from recent development ([7098c85](https://github.com/JCarran0/household-budgeting/commit/7098c8577e19cdf1edf96568105ca261e659adc9))

## [1.0.0-alpha.1] - 2024-09-02

### Added
- **Core Infrastructure**
  - Production deployment at https://budget.jaredcarrano.com
  - AWS infrastructure with Terraform (EC2, S3, IAM)
  - CI/CD pipeline with GitHub Actions and SSM deployments
  - SSL/TLS with Let's Encrypt certificates
  - Zero-downtime deployments with rollback capability

- **Authentication & Security**
  - JWT-based authentication with 15+ character passphrase requirement
  - Rate limiting and account lockout protection
  - AES-256 encryption for sensitive data
  - Secure token storage with httpOnly cookies

- **Account Management**
  - Plaid integration for Bank of America and Capital One
  - Account linking and disconnection
  - Automatic transaction sync with 730-day history
  - Pagination support (50 transactions per page)

- **Transaction Features**
  - Transaction splitting for shared expenses
  - Manual categorization with two-level hierarchy
  - Auto-categorization rules with OR logic
  - Transaction search and filtering
  - Bulk edit capability
  - Inline category editing

- **Budget Management**
  - Monthly budget creation and tracking
  - Copy budget from previous month
  - Budget vs actual comparison
  - Category-based spending analysis
  - User-specific category hierarchies

- **Reporting & Analytics**
  - Income vs expense analysis
  - Category spending trends with drill-down navigation
  - Budget performance reports
  - Monthly and yearly summaries
  - Visual charts with Recharts
  - "This Month" and "This Year" date range options

- **User Interface**
  - Professional dark theme with Mantine UI
  - Responsive design for mobile and desktop
  - Collapsible sidebar navigation
  - Real-time updates with React Query
  - Accessible form controls and navigation

- **Developer Tools**
  - Semantic versioning with automated changelog
  - `/review-tests` slash command for test strategy compliance
  - Comprehensive test coverage for critical paths

### Security
- Implemented comprehensive security measures per Information Security Policy
- Established incident response procedures
- Created security review processes
- Documented risk assessments

### Technical
- TypeScript strict mode with zero `any` types policy
- Risk-based testing strategy
- Integration tests with Plaid sandbox
- Singleton service architecture
- S3 storage abstraction for production data

[Unreleased]: https://github.com/JCarran0/household-budgeting/compare/v1.0.0-alpha.1...HEAD
[1.0.0-alpha.1]: https://github.com/JCarran0/household-budgeting/releases/tag/v1.0.0-alpha.1