# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### [5.57.5](https://github.com/JCarran0/household-budgeting/compare/v5.57.4...v5.57.5) (2026-04-24)


### Code Refactoring

* **accounts:** extract ConnectedAccountCard, ManualAccountCard, modals ([d442929](https://github.com/JCarran0/household-budgeting/commit/d442929b8fa49b81623cf68230729e682b7088d7))

### [5.57.4](https://github.com/JCarran0/household-budgeting/compare/v5.57.3...v5.57.4) (2026-04-24)


### Code Refactoring

* **settings:** extract Profile/Password/Notifications/Family/Mappings sections ([8b6cacc](https://github.com/JCarran0/household-budgeting/commit/8b6cacc19213c1be43ae136ba3df062dfdd5a47f))

### [5.57.3](https://github.com/JCarran0/household-budgeting/compare/v5.57.2...v5.57.3) (2026-04-24)


### Code Refactoring

* **trips:** extract TripFormModal, DeleteTripModal, TripCard ([7b7bdcc](https://github.com/JCarran0/household-budgeting/commit/7b7bdcca6f65e76bc96060a0bd6020efcb4d2780))

### [5.57.2](https://github.com/JCarran0/household-budgeting/compare/v5.57.1...v5.57.2) (2026-04-24)


### Code Refactoring

* **amazon:** extract matcher, pdf parser, categorizer adapter ([5ef27e5](https://github.com/JCarran0/household-budgeting/commit/5ef27e55f8a46906931871a7758012e0e6b9e0ce))

### [5.57.1](https://github.com/JCarran0/household-budgeting/compare/v5.57.0...v5.57.1) (2026-04-24)


### Code Refactoring

* **bva-ii:** extract section table + formatting helpers ([ee02502](https://github.com/JCarran0/household-budgeting/commit/ee025027d6b35b5f7fca55df2af92ed3cfc84cbe)), closes [#2](https://github.com/JCarran0/household-budgeting/issues/2)


### Documentation

* **tech-debt:** update Sprint 5 status — Tasks + BvA II landed ([0bfae31](https://github.com/JCarran0/household-budgeting/commit/0bfae310eb26c4051cf6c916ee1a89e0ac2ad9c9)), closes [#1](https://github.com/JCarran0/household-budgeting/issues/1) [#2](https://github.com/JCarran0/household-budgeting/issues/2)

## [5.57.0](https://github.com/JCarran0/household-budgeting/compare/v5.56.0...v5.57.0) (2026-04-24)


### Features

* **tasks:** B.3 — mobile swipe actions on cards (REQ-050..052) ([0b66ec1](https://github.com/JCarran0/household-budgeting/commit/0b66ec12563a0d531d623494a0352079da1e1eca))

## [5.56.0](https://github.com/JCarran0/household-budgeting/compare/v5.55.1...v5.56.0) (2026-04-24)


### Features

* **tasks:** B.2 — mobile kebab opens Edit modal directly (REQ-054) ([585162f](https://github.com/JCarran0/household-budgeting/commit/585162fb1a56358966d05469cca367272683043e))

### [5.55.1](https://github.com/JCarran0/household-budgeting/compare/v5.55.0...v5.55.1) (2026-04-24)


### Bug Fixes

* **tasks:** mobile tabs wrap to single row at Pixel 7 width ([#18](https://github.com/JCarran0/household-budgeting/issues/18)) ([658eea4](https://github.com/JCarran0/household-budgeting/commit/658eea4edc6fa3395a601b95f052a2789064b3dc))

## [5.55.0](https://github.com/JCarran0/household-budgeting/compare/v5.54.0...v5.55.0) (2026-04-24)


### Features

* **tasks:** B.1 — mobile Kanban tab shell (REQ-047..049) ([#16](https://github.com/JCarran0/household-budgeting/issues/16)) ([d12297e](https://github.com/JCarran0/household-budgeting/commit/d12297e94e0400a2277e2c6d8a225968d281f7b8))


### Code Refactoring

* **budgets:** retire legacy Budget Setup + Budget vs Actual tabs ([0d909aa](https://github.com/JCarran0/household-budgeting/commit/0d909aaa6f5294ad1d134268ce2717090d4cd3fc))

## [5.54.0](https://github.com/JCarran0/household-budgeting/compare/v5.53.7...v5.54.0) (2026-04-24)


### Features

* **tasks:** persist view + filter state across reloads (REQ-055) ([#14](https://github.com/JCarran0/household-budgeting/issues/14)) ([065ed40](https://github.com/JCarran0/household-budgeting/commit/065ed40854075d61801ccd05eaaba611285849f8))


### Documentation

* **tasks:** mobile Kanban BRD — tabs + swipe actions + long-press reorder ([#13](https://github.com/JCarran0/household-budgeting/issues/13)) ([5899ffd](https://github.com/JCarran0/household-budgeting/commit/5899ffd63f02546b944f942f4a4ccd8ac10581b8))

### [5.53.7](https://github.com/JCarran0/household-budgeting/compare/v5.53.6...v5.53.7) (2026-04-23)


### Bug Fixes

* **mobile:** Tasks page + badge modals responsive at phone widths ([#12](https://github.com/JCarran0/household-budgeting/issues/12)) ([e1df6c8](https://github.com/JCarran0/household-budgeting/commit/e1df6c80e2452e451eff50114cdc628a133d5054))

### [5.53.6](https://github.com/JCarran0/household-budgeting/compare/v5.53.5...v5.53.6) (2026-04-23)


### Code Refactoring

* **frontend:** TD-010 Sprint 5 — decompose Tasks.tsx 1835 → 485 LOC ([#11](https://github.com/JCarran0/household-budgeting/issues/11)) ([e10a9aa](https://github.com/JCarran0/household-budgeting/commit/e10a9aaa28bbb2c0e12e89404f90f75f57b0d820))

### [5.53.5](https://github.com/JCarran0/household-budgeting/compare/v5.53.4...v5.53.5) (2026-04-23)


### Tests

* **backend:** realign 12 drifted integration/service suites with familyId storage ([a527ff9](https://github.com/JCarran0/household-budgeting/commit/a527ff9f901a3df542828e01f08bb5c4e085f0dd))

### [5.53.4](https://github.com/JCarran0/household-budgeting/compare/v5.53.3...v5.53.4) (2026-04-23)


### Tests

* TD-014 Sprint 4 — wire backend unit tests into CI + greenfield frontend Vitest/RTL ([27c2fab](https://github.com/JCarran0/household-budgeting/commit/27c2faba988fbb3d10e8016b6b162eb76d24558d))

### [5.53.3](https://github.com/JCarran0/household-budgeting/compare/v5.53.2...v5.53.3) (2026-04-23)


### Bug Fixes

* **security:** TD-004/TD-005/TD-015 Sprint 3 — CSP, markdown sanitize, persistent rate limiter ([cd0d756](https://github.com/JCarran0/household-budgeting/commit/cd0d7566973e92f657c8567304e0e9ee2cb4121b))

### [5.53.2](https://github.com/JCarran0/household-budgeting/compare/v5.53.1...v5.53.2) (2026-04-23)


### Documentation

* **claude:** trim CLAUDE.md ~54% — collapse ADRs to one-liners, pointer-ize ops sections ([5d08cd1](https://github.com/JCarran0/household-budgeting/commit/5d08cd1b2c26b5ac75c94fc277c4b83c72c339a9))

### [5.53.1](https://github.com/JCarran0/household-budgeting/compare/v5.53.0...v5.53.1) (2026-04-23)


### Performance Improvements

* TD-012/TD-013 Sprint 2 — chatbot tool caps + optimistic transaction cache ([4ffb3d4](https://github.com/JCarran0/household-budgeting/commit/4ffb3d45a929555ac7aeebc3855c25d9b98c4361))

## [5.53.0](https://github.com/JCarran0/household-budgeting/compare/v5.52.1...v5.53.0) (2026-04-23)


### Features

* **leaderboard:** Task Leaderboard v2.0 — 48 badges, medal UI, queued celebrations ([#8](https://github.com/JCarran0/household-budgeting/issues/8)) ([f25fff4](https://github.com/JCarran0/household-budgeting/commit/f25fff47ce445ff4a3fc80017fd46e4dc227390e))

### [5.52.1](https://github.com/JCarran0/household-budgeting/compare/v5.52.0...v5.52.1) (2026-04-22)


### Performance Improvements

* **backend:** TD-011/TD-012 Sprint 1 — storage mutex, per-request memo, prompt caching ([#7](https://github.com/JCarran0/household-budgeting/issues/7)) ([c14715b](https://github.com/JCarran0/household-budgeting/commit/c14715b370910f9fc9f27e66e562913055f03b29))

## [5.52.0](https://github.com/JCarran0/household-budgeting/compare/v5.51.1...v5.52.0) (2026-04-22)


### Features

* **inspiration:** 18% chance villain slide-in with dramatic sting ([756584f](https://github.com/JCarran0/household-budgeting/commit/756584fb76fbc02d0f54cb4669d77e33e959e76d))


### Bug Fixes

* **inspiration:** shuffle-bag daily quote + 20 new quotes (no repeats) ([2d7e29f](https://github.com/JCarran0/household-budgeting/commit/2d7e29f5533f8edbc2b9ca85181a509c44ca3ede))


### Documentation

* **task-leaderboard:** v2.0 — 48-badge catalog + tier-driven polish ([a06858f](https://github.com/JCarran0/household-budgeting/commit/a06858fe757612a0d99894b850b5c1507cca5d9e))

### [5.51.1](https://github.com/JCarran0/household-budgeting/compare/v5.51.0...v5.51.1) (2026-04-21)


### Bug Fixes

* **mobile:** force ResponsiveModal media query to evaluate on first render ([b68a4ce](https://github.com/JCarran0/household-budgeting/commit/b68a4ce190d1a1ade6445d5b699ac53451702fc2))

## [5.51.0](https://github.com/JCarran0/household-budgeting/compare/v5.50.1...v5.51.0) (2026-04-21)


### Features

* **bva-ii:** Actual cell opens transaction preview (hover → tooltip, click → modal) ([2bb0af5](https://github.com/JCarran0/household-budgeting/commit/2bb0af55b2cf96ed4a24436239b77908efd6fd1e))
* **bva-ii:** cashflow-convention summary totals + explanatory tooltips ([96cf4a7](https://github.com/JCarran0/household-budgeting/commit/96cf4a7868eb6dd01a5440d17207c1b792171d09))
* **bva-ii:** edit modal — toggle category rollover inline ([20b32b7](https://github.com/JCarran0/household-budgeting/commit/20b32b70ddfb9628b5048746bb2d1b75591bb17e))
* **bva-ii:** rollover toggle auto-saves on change ([f44a6d8](https://github.com/JCarran0/household-budgeting/commit/f44a6d83e81d91a205aa1d75457e5b7c6711583f))


### Documentation

* **bva-ii:** BRD §9 — document summary-strip cashflow totals ([38d1407](https://github.com/JCarran0/household-budgeting/commit/38d14074787c4fd09a18b3188756ee93bf5002c6))

### [5.50.1](https://github.com/JCarran0/household-budgeting/compare/v5.50.0...v5.50.1) (2026-04-21)


### Code Refactoring

* **budgets:** soft-hide old Budget tabs; rename BvA II → BvA ([c3c7754](https://github.com/JCarran0/household-budgeting/commit/c3c7754a812425640e624303246294da31b15f0c))

## [5.50.0](https://github.com/JCarran0/household-budgeting/compare/v5.49.2...v5.50.0) (2026-04-21)


### Features

* **budgets:** add rollover balance + effective budget utilities ([f332d16](https://github.com/JCarran0/household-budgeting/commit/f332d16d94ca6d741ebea7cf5b98c6e15d014fee))
* **budgets:** BvA II accordion render + summary strip ([aa17662](https://github.com/JCarran0/household-budgeting/commit/aa176628fef292dd1fef76a06fffd7584b801cba))
* **budgets:** BvA II data layer with rollover-aware composition ([11ebaee](https://github.com/JCarran0/household-budgeting/commit/11ebaee95479099e227d56d567c71e50ba3d39c3))
* **budgets:** BvA II filters — types, rollover, variance ([1190f86](https://github.com/JCarran0/household-budgeting/commit/1190f86cbe02009f631ad6bdc65337e34041775e))
* **budgets:** BvA II keyboard-accessible parent rows ([3a4630c](https://github.com/JCarran0/household-budgeting/commit/3a4630cc4096e578ef712c2f884a1a7d6a0ed15e))
* **budgets:** BvA II row-level budget edit modal ([deeb6ef](https://github.com/JCarran0/household-budgeting/commit/deeb6ef37ffaf122df22a73aede515f567cf2c72))
* **budgets:** BvA II show-dismissed toggle + serialization tests ([6bcdbf6](https://github.com/JCarran0/household-budgeting/commit/6bcdbf6bbaeb9f5aa9419fdd2b00549e83c70af6))
* **budgets:** scaffold Budget vs. Actuals II tab ([59c891d](https://github.com/JCarran0/household-budgeting/commit/59c891dcd4c1d6e82137e65dbdd7573a27aaf867))
* **bva-ii:** Available + Rollover column redesign (BRD Rev-2) ([81f145d](https://github.com/JCarran0/household-budgeting/commit/81f145d54ca77da6d04a2cf6dba1aba1180c524e))
* **categories:** enforce rollover subtree exclusivity on update ([b71b294](https://github.com/JCarran0/household-budgeting/commit/b71b294fa2653b7947b70af12ebb3222f94e1e04))
* **categories:** rollover toggle UX with subtree conflict resolution ([0709136](https://github.com/JCarran0/household-budgeting/commit/0709136cbf5549ca1b783865e88e57e4d5dfe14f))


### Bug Fixes

* **budgets:** BvA II — drop row-count badge from section headers ([8e03917](https://github.com/JCarran0/household-budgeting/commit/8e0391796a8a321ca387f000e482e45ba977fba6))
* **budgets:** BvA II arrow tracks sign, not goodness ([a0945b7](https://github.com/JCarran0/household-budgeting/commit/a0945b76a4197a1eb5a2ea6a0537714155a1e77f))
* **budgets:** BvA II chevron stays left, rows default to collapsed ([8045341](https://github.com/JCarran0/household-budgeting/commit/8045341f9d650b9d03215d239953a12ba11d4fd5))
* **budgets:** BvA II variance cell right-justify + sort by magnitude ([0ad4394](https://github.com/JCarran0/household-budgeting/commit/0ad43943ce34fe24809efa3fa219244481423771))
* **bva-ii:** edit modal — Update buttons stay enabled after typing amount ([d88906b](https://github.com/JCarran0/household-budgeting/commit/d88906bc67ff9e4abba6cbcbeda2d2bf88f9d808))
* **bva-ii:** edit modal rollover callout — later months, not prior ([ecd8972](https://github.com/JCarran0/household-budgeting/commit/ecd8972f87685d4bb739563f58a458cb7a5cae1a))
* **bva-ii:** simpler rollover callout copy ([5647bb1](https://github.com/JCarran0/household-budgeting/commit/5647bb18f4fde0c565a3e97cf4ec1e38532e1dff))
* **bva-ii:** table overflow — horizontal scroll + no-wrap cells ([3627bca](https://github.com/JCarran0/household-budgeting/commit/3627bca2cb7e79ba5a6927e6b19064d83d309034))


### Documentation

* add Rollover Budgets + Budget vs. Actuals II BRDs and plans ([d1e28bb](https://github.com/JCarran0/household-budgeting/commit/d1e28bb0d26527cee4a39e19822bb002d61fa2ce))
* **bva-ii:** BRD Revision 2 — Available + Rollover column redesign ([d783b49](https://github.com/JCarran0/household-budgeting/commit/d783b497d19a7aeaae5f460da3bab2b5e20a00c6))
* **bva-ii:** note post-Phase-9 UAT polish in plan ([0765b77](https://github.com/JCarran0/household-budgeting/commit/0765b77408fa2177e31d9ef35348f3fd47fb53a0))
* **bva-ii:** Phase 9 marked shipped ([6fcd124](https://github.com/JCarran0/household-budgeting/commit/6fcd12444e61132ff79d095cddb4d396726aa94b))
* finalize rollover + BvA II plans; CLAUDE.md critical files ([059efa4](https://github.com/JCarran0/household-budgeting/commit/059efa426c5ebd2d2df1c45a05e31b61d3acff33))

### [5.49.2](https://github.com/JCarran0/household-budgeting/compare/v5.49.1...v5.49.2) (2026-04-21)


### Bug Fixes

* **dates:** anchor user-visible date boundaries to US Eastern Time ([412e03d](https://github.com/JCarran0/household-budgeting/commit/412e03d6c8f58648b9696cbfa39df6e9a76087cb))

### [5.49.1](https://github.com/JCarran0/household-budgeting/compare/v5.49.0...v5.49.1) (2026-04-21)


### Bug Fixes

* **trips:** skip travel-home day in stay-gap nudge ([8f00fdc](https://github.com/JCarran0/household-budgeting/commit/8f00fdc9904f1dc9872df8d68f2598454ab74d15))

## [5.49.0](https://github.com/JCarran0/household-budgeting/compare/v5.48.0...v5.49.0) (2026-04-21)


### Features

* **trips:** open photo hero from eat/play stop tiles ([702c537](https://github.com/JCarran0/household-budgeting/commit/702c5375df9b62ec519b6cf30cdf054aa505934e))
* **trips:** stay thin-banner and decouple stop tile from card height ([b1e9ae1](https://github.com/JCarran0/household-budgeting/commit/b1e9ae12eec9d0de476edb5ad0b45f3e6d320076))


### Bug Fixes

* **trips:** invalidate trip detail cache on update ([4ebb941](https://github.com/JCarran0/household-budgeting/commit/4ebb941c4ba58cb7c4e6f471005688e9b5a43e8d))

## [5.48.0](https://github.com/JCarran0/household-budgeting/compare/v5.47.0...v5.48.0) (2026-04-21)


### Features

* **trips:** flush-left photo tile on eat/play stop cards ([4b48dc3](https://github.com/JCarran0/household-budgeting/commit/4b48dc3224c1d4f39cdff77e3f48bb74a7092de7))

## [5.47.0](https://github.com/JCarran0/household-budgeting/compare/v5.46.0...v5.47.0) (2026-04-21)


### Features

* **ui:** make all modals full-screen on mobile via ResponsiveModal wrapper ([#6](https://github.com/JCarran0/household-budgeting/issues/6)) ([8c6d6a9](https://github.com/JCarran0/household-budgeting/commit/8c6d6a96c2da1e989c1c22572b85b4280e66e342))

## [5.46.0](https://github.com/JCarran0/household-budgeting/compare/v5.45.0...v5.46.0) (2026-04-21)


### Features

* **trips:** add cover photo banner to trip detail header ([5370522](https://github.com/JCarran0/household-budgeting/commit/537052298e20a68819bfae06785a7db30fc1f831))
* **trips:** extend cover banner to list cards ([7794afe](https://github.com/JCarran0/household-budgeting/commit/7794afe6262643d2f269bb7b8af9f969986ad5ab))


### Documentation

* add app cost visibility BRD ([352a6d6](https://github.com/JCarran0/household-budgeting/commit/352a6d64ace9c34caf14e47fc297f136bf7df49f))

## [5.45.0](https://github.com/JCarran0/household-budgeting/compare/v5.44.1...v5.45.0) (2026-04-21)


### Features

* **query:** enable React Query focus refetch and tune staleTime by data heat ([381e030](https://github.com/JCarran0/household-budgeting/commit/381e0300f85b7c7825c5537c4b7421a701500c23))


### Documentation

* add stale data mitigation BRD and phased plan ([ba847bf](https://github.com/JCarran0/household-budgeting/commit/ba847bf85a31bfc3fdbfb6de227a906a43dbcf50))


### Chores

* **query:** remove unused eslint-disable directive ([b7ccb57](https://github.com/JCarran0/household-budgeting/commit/b7ccb578c87eb84572c1b6dcaa917708bf3b3fe4))

### [5.44.1](https://github.com/JCarran0/household-budgeting/compare/v5.44.0...v5.44.1) (2026-04-20)


### Chores

* **ci:** bump checkout and setup-node to v5 for Node 24 runtime ([fd0fef2](https://github.com/JCarran0/household-budgeting/commit/fd0fef25174581ba26d6535c123edd6d8dbe6a1a))

## [5.44.0](https://github.com/JCarran0/household-budgeting/compare/v5.43.5...v5.44.0) (2026-04-20)


### Features

* **dashboard:** drop Connected Accounts card; link Monthly Budget Status to comparison view ([b5731b7](https://github.com/JCarran0/household-budgeting/commit/b5731b7dc12c7659134c7267b383583660fece1f))


### Bug Fixes

* **reports:** parent category preview includes children, shows filtered count, uses exact dates ([c9ac90b](https://github.com/JCarran0/household-budgeting/commit/c9ac90b00509a0fabff41cf85ae03ce313d09fa3))

### [5.43.5](https://github.com/JCarran0/household-budgeting/compare/v5.43.4...v5.43.5) (2026-04-20)


### Documentation

* close reorder UX alignment debt as won't do ([c7b0543](https://github.com/JCarran0/household-budgeting/commit/c7b05436e5025996a9eb908a5f02c08d5d45b3d0))

### [5.43.4](https://github.com/JCarran0/household-budgeting/compare/v5.43.3...v5.43.4) (2026-04-20)


### Documentation

* mark Transfer Linking as won't do ([fc12147](https://github.com/JCarran0/household-budgeting/commit/fc12147eb03acab607ae90554e9410eff110f567))

### [5.43.3](https://github.com/JCarran0/household-budgeting/compare/v5.43.2...v5.43.3) (2026-04-20)


### Documentation

* clear resolved entries from Known Issues table ([c5ebcac](https://github.com/JCarran0/household-budgeting/commit/c5ebcacc79d7b1e016bdcc23e30eb71f4877c55f))

### [5.43.2](https://github.com/JCarran0/household-budgeting/compare/v5.43.1...v5.43.2) (2026-04-20)


### Code Refactoring

* **routes:** migrate remaining catch blocks to next(error) (TD-10) ([959f05d](https://github.com/JCarran0/household-budgeting/commit/959f05dbe5936eb131e963d1fb8e0d2b5a297449)), closes [#10](https://github.com/JCarran0/household-budgeting/issues/10)

### [5.43.1](https://github.com/JCarran0/household-budgeting/compare/v5.43.0...v5.43.1) (2026-04-20)


### Documentation

* **trips:** refresh Trip Place Photos architecture decision row ([4e7e75d](https://github.com/JCarran0/household-budgeting/commit/4e7e75d97dae086e92d760d94afd72c1ecfc2f90))

## [5.43.0](https://github.com/JCarran0/household-budgeting/compare/v5.42.0...v5.43.0) (2026-04-20)


### Features

* **trips:** picker parity — Eat/Play form gets the candidate strip ([6c487b4](https://github.com/JCarran0/household-budgeting/commit/6c487b4ae8ef312f03e84b73637a3f8d6ad80d32))

## [5.42.0](https://github.com/JCarran0/household-budgeting/compare/v5.41.2...v5.42.0) (2026-04-20)


### Features

* **trips:** place photos on Eat/Play cards and Map popups ([b082a4d](https://github.com/JCarran0/household-budgeting/commit/b082a4d5796aa98bb1b5cff020db11e96b7bdc37))

### [5.41.2](https://github.com/JCarran0/household-budgeting/compare/v5.41.1...v5.41.2) (2026-04-20)


### Bug Fixes

* **inspiration:** reset daily pilot modal at 5 AM ET ([71616d9](https://github.com/JCarran0/household-budgeting/commit/71616d92becd17f67649d68e5008b3110ddc1767))

### [5.41.1](https://github.com/JCarran0/household-budgeting/compare/v5.41.0...v5.41.1) (2026-04-20)


### Documentation

* **trips:** refresh TRIP-PLACE-PHOTOS-PLAN statuses ([1360180](https://github.com/JCarran0/household-budgeting/commit/1360180f692fd3ce701516114e7b4659cedd7e69))

## [5.41.0](https://github.com/JCarran0/household-budgeting/compare/v5.40.0...v5.41.0) (2026-04-20)


### Features

* **trips:** pick from candidate photos in the Stay form ([af1ae24](https://github.com/JCarran0/household-budgeting/commit/af1ae247511e010809210a009f6883527c49cf05))

## [5.40.0](https://github.com/JCarran0/household-budgeting/compare/v5.39.0...v5.40.0) (2026-04-20)


### Features

* **trips:** click place photo to open hero modal with larger image ([b08dff6](https://github.com/JCarran0/household-budgeting/commit/b08dff6bef0d098c67d0364937ca704c0c75c555))

## [5.39.0](https://github.com/JCarran0/household-budgeting/compare/v5.38.0...v5.39.0) (2026-04-20)


### Features

* **trips:** add place photos to verified locations + Stay banner ([d9cdfdb](https://github.com/JCarran0/household-budgeting/commit/d9cdfdbe9aebb082edfd66f05a35f334d7aefc88))

## [5.38.0](https://github.com/JCarran0/household-budgeting/compare/v5.37.2...v5.38.0) (2026-04-20)


### Features

* **reports:** unify net cash flow, split savings rate into standard + contribution ([7995f15](https://github.com/JCarran0/household-budgeting/commit/7995f1574f57e87083312d0fce3f68366a397aab))

### [5.37.2](https://github.com/JCarran0/household-budgeting/compare/v5.37.1...v5.37.2) (2026-04-19)


### Bug Fixes

* **reports:** exclude current partial month from YTD and Last N Mo KPIs ([49cb19a](https://github.com/JCarran0/household-budgeting/commit/49cb19a74c33ca9e38f4fb8312d76450e0e4a121))

### [5.37.1](https://github.com/JCarran0/household-budgeting/compare/v5.37.0...v5.37.1) (2026-04-19)


### Bug Fixes

* **dates:** stop off-by-one shift when piping Mantine 8 picker values through date-fns ([550f8fb](https://github.com/JCarran0/household-budgeting/commit/550f8fb82303acddc0d2cc75c4b1bb51454f211d))

## [5.37.0](https://github.com/JCarran0/household-budgeting/compare/v5.36.0...v5.37.0) (2026-04-19)


### Features

* **tasks:** show daily inspirational quote above leaderboard ([b3070dd](https://github.com/JCarran0/household-budgeting/commit/b3070ddf923989ab76572cf8099be6414a6a4d06))

## [5.36.0](https://github.com/JCarran0/household-budgeting/compare/v5.35.0...v5.36.0) (2026-04-19)


### Features

* **tasks:** leaderboard streaks + badges + escalating chime ([#5](https://github.com/JCarran0/household-budgeting/issues/5)) ([7bf9f6a](https://github.com/JCarran0/household-budgeting/commit/7bf9f6a708ff2210964d52a2375be58379333e06))

## [5.35.0](https://github.com/JCarran0/household-budgeting/compare/v5.34.0...v5.35.0) (2026-04-19)


### Features

* **tasks:** inherit board filters as defaults on task create ([11505c8](https://github.com/JCarran0/household-budgeting/commit/11505c85bf75248e1fcb27be0acb12f940438cd1))
* **ui:** daily inspiration modal with rotating pilot-themed quotes ([2f08bc4](https://github.com/JCarran0/household-budgeting/commit/2f08bc42a7b31fab1a47e0034629b881d5c78e72))

## [5.34.0](https://github.com/JCarran0/household-budgeting/compare/v5.33.1...v5.34.0) (2026-04-19)


### Features

* **tasks:** play a celebratory chime when a task hits done ([39c2245](https://github.com/JCarran0/household-budgeting/commit/39c2245dea7acd0d4502f1af19aecc1186ef495e))

### [5.33.1](https://github.com/JCarran0/household-budgeting/compare/v5.33.0...v5.33.1) (2026-04-19)


### Bug Fixes

* **tasks:** due dates off by one (local-midnight parsing) ([a6d6efa](https://github.com/JCarran0/household-budgeting/commit/a6d6efaddffcc86b6eeef42a89d34d4672c7b20b))
* **tasks:** route Kanban Done drops through status endpoint; modal due-date TZ fix ([164f196](https://github.com/JCarran0/household-budgeting/commit/164f1964702d41160d6576c514707bba33e4d7ca))

## [5.33.0](https://github.com/JCarran0/household-budgeting/compare/v5.32.0...v5.33.0) (2026-04-19)


### Features

* **tasks:** checklist drag fix, leaderboard assignee credit, subtask credit ([6069096](https://github.com/JCarran0/household-budgeting/commit/6069096d274de241608eb7e74694caddcedbd8d7))
* **ui:** highlightToday across remaining date pickers ([6d5fc66](https://github.com/JCarran0/household-budgeting/commit/6d5fc6620d33ee1156b965a35015a7acc3bfdf8e))

## [5.32.0](https://github.com/JCarran0/household-budgeting/compare/v5.31.0...v5.32.0) (2026-04-19)


### Features

* **tasks:** hover-preview tasks making up each leaderboard count ([79a4043](https://github.com/JCarran0/household-budgeting/commit/79a40434336fdd5328dd9ade468f59da252d355b))

## [5.31.0](https://github.com/JCarran0/household-budgeting/compare/v5.30.0...v5.31.0) (2026-04-19)


### Features

* **trips:** list rows link to detail, highlight today, fix stop-update ([7447c71](https://github.com/JCarran0/household-budgeting/commit/7447c71cbfc29197f112accf3bafd5c51e2de294))


### Chores

* **ui:** suppress 1Password autofill inside app shell ([9559d32](https://github.com/JCarran0/household-budgeting/commit/9559d3251e36ccdb40f692361f92013124a66639))

## [5.30.0](https://github.com/JCarran0/household-budgeting/compare/v5.29.0...v5.30.0) (2026-04-19)


### Features

* **trips:** V2 — Map tab + photo album link ([6e82437](https://github.com/JCarran0/household-budgeting/commit/6e82437bccbb346f59e2438dc9573d0928258287))

## [5.29.0](https://github.com/JCarran0/household-budgeting/compare/v5.28.0...v5.29.0) (2026-04-19)


### Features

* **tasks:** v2.1 Checklist redesign — Keep-style single button + kebab metadata ([c9ae232](https://github.com/JCarran0/household-budgeting/commit/c9ae232059bcbb14da48d32baa3d739318f5f43b))


### Documentation

* **claude:** trim CLAUDE.md from 700 to 243 lines (~65% reduction) ([ac45e3d](https://github.com/JCarran0/household-budgeting/commit/ac45e3dab984d588d509802a05a3e49a7e31e12a))

## [5.28.0](https://github.com/JCarran0/household-budgeting/compare/v5.27.1...v5.28.0) (2026-04-19)


### Features

* **tasks:** v2.0 — checklist view, snooze, manual reorder, family-scope leaderboard ([f2391f2](https://github.com/JCarran0/household-budgeting/commit/f2391f29ac996d0a184ee2184c0bbfd04a9580c8))


### Code Refactoring

* **chatbot:** migrate submit_github_issue onto action-card registry (D-15) ([b3ab071](https://github.com/JCarran0/household-budgeting/commit/b3ab07136bffe15c3ca93009460f3b4a775a7cc1))


### Documentation

* **pwa:** mark plan shipped — Phase 6 device QA complete ([a0e3d7c](https://github.com/JCarran0/household-budgeting/commit/a0e3d7cb8db3d4aad63b7bb2d43ff719727dcb72))
* reconcile stale plan statuses with shipped code ([859bdc1](https://github.com/JCarran0/household-budgeting/commit/859bdc17c1599ad398373080c2e2968b6e78e6e3))
* reflect D-15 migration in BRD and CLAUDE.md ([be3d267](https://github.com/JCarran0/household-budgeting/commit/be3d2675b349ccbb078acfb63a9788c5afac8099))

### [5.27.1](https://github.com/JCarran0/household-budgeting/compare/v5.27.0...v5.27.1) (2026-04-19)


### Documentation

* **projects:** mark enhancements plan shipped + capture D11-D13 ([95b9ee3](https://github.com/JCarran0/household-budgeting/commit/95b9ee3c5f3db3565d0949567ca4fd1604b99638))

## [5.27.0](https://github.com/JCarran0/household-budgeting/compare/v5.26.2...v5.27.0) (2026-04-19)


### Features

* **projects:** line-item estimates + Tasks tab (BRD §4.5, §5.5) ([aba0da0](https://github.com/JCarran0/household-budgeting/commit/aba0da0616e858d3146bc65d95fe265380652279))


### Documentation

* **tasks:** plan v2.0 enhancements — checklist view, snooze, reorder ([02ed9db](https://github.com/JCarran0/household-budgeting/commit/02ed9dbcffb90f954e757c4909c56f06f352e00d))

### [5.26.2](https://github.com/JCarran0/household-budgeting/compare/v5.26.1...v5.26.2) (2026-04-18)


### Bug Fixes

* **trips:** prevent password-manager autofill on stop name fields ([8cd40a4](https://github.com/JCarran0/household-budgeting/commit/8cd40a476d03b5ac244b048a67dd795b078d8a7f))

### [5.26.1](https://github.com/JCarran0/household-budgeting/compare/v5.26.0...v5.26.1) (2026-04-18)


### Bug Fixes

* **auth:** correct shared/types import path in authValidators ([7bd1d4b](https://github.com/JCarran0/household-budgeting/commit/7bd1d4b8151f69860d12d79092a692f432b4191d))

## [5.26.0](https://github.com/JCarran0/household-budgeting/compare/v5.25.0...v5.26.0) (2026-04-18)


### Features

* **trips:** add itinerary stops to trips (phases 1-2, backend) ([5659875](https://github.com/JCarran0/household-budgeting/commit/5659875e5b7cf08d60d6d0ea49171780f3f27e41))
* **trips:** itinerary empty state, templates, polish + docs (phases 6-8) ([8758542](https://github.com/JCarran0/household-budgeting/commit/8758542099753bf316c2b5e1a6cd0c8913025ffe))
* **trips:** Trip Detail page + agenda + stop creation (phases 3-5) ([c2f9b23](https://github.com/JCarran0/household-budgeting/commit/c2f9b236e0780ae9c0940039b3f960e3df700334))


### Documentation

* **project-plan:** add Phase 14 and parked read_brd idea ([2f4b2fa](https://github.com/JCarran0/household-budgeting/commit/2f4b2fa05bfa93a5d57378a24c0c6219382d7d99))


### CI/CD

* **workflows:** expose VITE_GOOGLE_PLACES_API_KEY to frontend builds ([617c143](https://github.com/JCarran0/household-budgeting/commit/617c1438e316aace9a482f8831d2151badc83924))

## [5.25.0](https://github.com/JCarran0/household-budgeting/compare/v5.24.0...v5.25.0) (2026-04-18)


### Features

* **ai-categorization:** per-row skip inside bucket review ([ed3049c](https://github.com/JCarran0/household-budgeting/commit/ed3049c12c940a378a3390eccf6f90737d28007d))
* **rebrand:** Budget Tracker → Family Tracker, Budget Bot → Helper Bot ([f8f1e4f](https://github.com/JCarran0/household-budgeting/commit/f8f1e4fc0d29e5d75fea207d52f12706fbd6220d))
* **transactions:** row-click opens edit modal; split moves into modal ([9dfd01c](https://github.com/JCarran0/household-budgeting/commit/9dfd01c4615ed1a5570a269c7239f522c7c32910))
* **users:** per-user identity color ([7620e8e](https://github.com/JCarran0/household-budgeting/commit/7620e8e277e224a422e982d9a4101435be4e5a79))

## [5.24.0](https://github.com/JCarran0/household-budgeting/compare/v5.23.0...v5.24.0) (2026-04-18)


### Features

* **budget-rollup:** canonical parent rollup utilities + Reports widget refactor ([c308fd5](https://github.com/JCarran0/household-budgeting/commit/c308fd58bf1e1c585deb949f296154b85a521264))

## [5.23.0](https://github.com/JCarran0/household-budgeting/compare/v5.22.0...v5.23.0) (2026-04-17)


### Features

* **chat-actions:** implement frontend phases 6-9 (composer, API client, action cards, conversation state) ([e24c548](https://github.com/JCarran0/household-budgeting/commit/e24c548dc8694ee4c669c718e5e79a5b033c9809))
* **chat-actions:** Phase 1+2 — shared types, action registry, and create_task handler ([02e1af2](https://github.com/JCarran0/household-budgeting/commit/02e1af20002fc7a697b8236b107d2a084bd7c38a))
* **chat-actions:** Phases 3–5 — upload middleware, tool wiring, confirm endpoint + security tests ([a4f9a0f](https://github.com/JCarran0/household-budgeting/commit/a4f9a0faf5271ca7a60ce9349d1f5143cacc9539))
* **tasks:** add Start Task button to create modal for one-step start flow ([8c5369b](https://github.com/JCarran0/household-budgeting/commit/8c5369bf342022a44ad48ccdd9a5f6a93cc21e63))


### Bug Fixes

* **chat-actions:** validator accepts empty message when attachment is present ([bf08bfb](https://github.com/JCarran0/household-budgeting/commit/bf08bfbc790d70226ffe5d9a793c3c17810b7252))


### Code Refactoring

* **chat-actions:** replace __fullProposal side-band with typed Map ([0f87589](https://github.com/JCarran0/household-budgeting/commit/0f87589955bfb3455bfd225b0d4baff13bed1870))


### Tests

* **chat-actions:** add security tests 10.6, 10.7, 10.9, 10.10 ([ee26370](https://github.com/JCarran0/household-budgeting/commit/ee263702fee0a8c39250a8d6401abc5b62524326))


### Documentation

* **chat-actions:** add BRD and implementation plan for chat attachments and action cards ([dc34719](https://github.com/JCarran0/household-budgeting/commit/dc347195dd08d18107c06f1ef16710b0321f3a72))
* **chat-actions:** flip Phase 10 phase-level status to completed ([7a05768](https://github.com/JCarran0/household-budgeting/commit/7a057682d299b36b9ab82bcf75fc3d29d14bd338))
* **chat-actions:** mark Phases 1–5 complete, capture implementation decisions ([bbbbc50](https://github.com/JCarran0/household-budgeting/commit/bbbbc50bfefd711b2a3eefec37a48f2a8d2b00e6))
* **chat-actions:** mark Phases 6–9 complete, add D-IMPL-5 and D-IMPL-6 ([f155d11](https://github.com/JCarran0/household-budgeting/commit/f155d11ce909e3d3efadb16726498d6f035f66cc))
* **chat-actions:** Phase 12 doc updates for action card registry pattern ([af3a95f](https://github.com/JCarran0/household-budgeting/commit/af3a95f76af1d0ba89155c03ad77768ce59f7a32))

## [5.22.0](https://github.com/JCarran0/household-budgeting/compare/v5.21.0...v5.22.0) (2026-04-17)


### Features

* **chatbot:** full-screen mobile layout and skip keyboard auto-focus ([5fe4f75](https://github.com/JCarran0/household-budgeting/commit/5fe4f75e4799535a8e6ecd608a079eddb84783e0))

## [5.21.0](https://github.com/JCarran0/household-budgeting/compare/v5.20.0...v5.21.0) (2026-04-17)


### Features

* **branding:** replace pig icon with retro rainbow logo ([02dcf1f](https://github.com/JCarran0/household-budgeting/commit/02dcf1fd9e3804c0ecd4f9cc2437b424eb6a4ce4))

## [5.20.0](https://github.com/JCarran0/household-budgeting/compare/v5.19.4...v5.20.0) (2026-04-17)


### Features

* **amazon-receipts:** add global eligible-count endpoint for AI Categorize menu ([3c8947b](https://github.com/JCarran0/household-budgeting/commit/3c8947be19cb95f619f2c1d96d7511fcdc93b14d))

### [5.19.4](https://github.com/JCarran0/household-budgeting/compare/v5.19.3...v5.19.4) (2026-04-17)


### Bug Fixes

* **pwa:** force reload fallback on update, correct vite-plugin-pwa config ([e37e7b2](https://github.com/JCarran0/household-budgeting/commit/e37e7b267cfe7d1b693342be854817e95a9acf46))

### [5.19.3](https://github.com/JCarran0/household-budgeting/compare/v5.19.2...v5.19.3) (2026-04-17)


### Bug Fixes

* **pwa:** handle SKIP_WAITING message in service worker for update prompt ([5ec4694](https://github.com/JCarran0/household-budgeting/commit/5ec469490370f3ad82888bd925910191e3186a80))

### [5.19.2](https://github.com/JCarran0/household-budgeting/compare/v5.19.1...v5.19.2) (2026-04-17)


### Bug Fixes

* **pwa:** use SW registration.showNotification for test notification on Android ([a4931f8](https://github.com/JCarran0/household-budgeting/commit/a4931f82c3aee13ee59ba67a1ded8b88f14369a7))

### [5.19.1](https://github.com/JCarran0/household-budgeting/compare/v5.19.0...v5.19.1) (2026-04-17)


### CI/CD

* inject VAPID keys from GitHub Secrets into production .env ([5832566](https://github.com/JCarran0/household-budgeting/commit/58325661269b26d69099c5995a1a44ac0ff476a0))

## [5.19.0](https://github.com/JCarran0/household-budgeting/compare/v5.18.1...v5.19.0) (2026-04-17)


### Features

* **pwa:** add notification permission UI and preferences settings (Phase 5) ([a1ef9b3](https://github.com/JCarran0/household-budgeting/commit/a1ef9b3c0513c6a52dd64f4f16576a072fea5d67))
* **pwa:** add push notification infrastructure (Phase 3) ([3312647](https://github.com/JCarran0/household-budgeting/commit/331264775ba8a61c22a39972ec9137063d19e13d))
* **pwa:** add PWA manifest, service worker, and installability (Phase 1) ([b0f9e2e](https://github.com/JCarran0/household-budgeting/commit/b0f9e2e6af4157780e0e5478c9ab9a6cf0750389))
* **pwa:** support image uploads for Amazon receipt matching ([e3d8da3](https://github.com/JCarran0/household-budgeting/commit/e3d8da3c5ec7efc283fa4ec99ffd4481f30c38fd))
* **pwa:** wire push notification triggers (Phase 4) ([8dd0255](https://github.com/JCarran0/household-budgeting/commit/8dd02556f987c2609883d12ad7f185fba8a42fe4))


### Bug Fixes

* **deps:** npm audit fix — resolve high/critical vulnerabilities in backend deps ([2e77105](https://github.com/JCarran0/household-budgeting/commit/2e77105a885c8dc0ed50565fbea203a059fc686d))


### Documentation

* **pwa:** mark phases 3–5 complete in plan ([c6c6a1d](https://github.com/JCarran0/household-budgeting/commit/c6c6a1d929412b387e9eaeee736ac95dcdc524d2))
* **pwa:** update plan — phases 1–5 complete, VAPID keys provisioned ([aacbb09](https://github.com/JCarran0/household-budgeting/commit/aacbb09cbb3e181e4caa699189dcf9d240ebdb2b))

### [5.18.1](https://github.com/JCarran0/household-budgeting/compare/v5.18.0...v5.18.1) (2026-04-17)


### Documentation

* **savings:** add BRD and implementation plan for savings category flag ([946483a](https://github.com/JCarran0/household-budgeting/commit/946483a741aae1b93d55d1dfc060f10d934f33e4))

## [5.18.0](https://github.com/JCarran0/household-budgeting/compare/v5.17.1...v5.18.0) (2026-04-17)


### Features

* **categories:** add isSavings flag to separate savings from spending ([bb2b66a](https://github.com/JCarran0/household-budgeting/commit/bb2b66ab187ca41574ce0d5402bb9a6247c48d88))


### Bug Fixes

* **reports:** make savings explicitly visible in cash flow report ([4c6865e](https://github.com/JCarran0/household-budgeting/commit/4c6865e331002c9c6443550ce0ff6f1da5920dba))

### [5.17.1](https://github.com/JCarran0/household-budgeting/compare/v5.17.0...v5.17.1) (2026-04-16)


### Bug Fixes

* **chatbot:** include manual accounts in chatbot getAccounts query ([5fbc63f](https://github.com/JCarran0/household-budgeting/commit/5fbc63faad86c2cb820cf8563e78a96edffc4b8f))
* **transactions:** handle missing body in sync endpoint ([d6bf269](https://github.com/JCarran0/household-budgeting/commit/d6bf2696d9487e6368101952a99699a4f88bcff2))


### Documentation

* **pwa:** add BRD and implementation plan for PWA mobile experience ([d32f52a](https://github.com/JCarran0/household-budgeting/commit/d32f52ada57c5a30343596853d94e04189e56ac6))

## [5.17.0](https://github.com/JCarran0/household-budgeting/compare/v5.16.4...v5.17.0) (2026-04-12)


### Features

* **tasks:** add tags, sub-tasks, and template editing ([edf7fe6](https://github.com/JCarran0/household-budgeting/commit/edf7fe6437800f22f0ceecd8b916ede9a1656869))

### [5.16.4](https://github.com/JCarran0/household-budgeting/compare/v5.16.3...v5.16.4) (2026-04-12)


### Bug Fixes

* **transactions:** clear all filters when clicking uncategorized transactions alert ([5523bce](https://github.com/JCarran0/household-budgeting/commit/5523bce20fe2b27a2843208df9c5f0755bb82266))

### [5.16.3](https://github.com/JCarran0/household-budgeting/compare/v5.16.2...v5.16.3) (2026-04-12)


### Code Refactoring

* **transactions:** centralize removed-transaction filter in transactionReader.ts ([667cb55](https://github.com/JCarran0/household-budgeting/commit/667cb55daa262024f8cf91b5e09ee27bc558349a))

### [5.16.2](https://github.com/JCarran0/household-budgeting/compare/v5.16.1...v5.16.2) (2026-04-12)


### Bug Fixes

* **transactions:** filter out status=removed transactions from all query paths ([3817402](https://github.com/JCarran0/household-budgeting/commit/38174027f4c2825bd368d3876b4c819b1898f980))

### [5.16.1](https://github.com/JCarran0/household-budgeting/compare/v5.16.0...v5.16.1) (2026-04-12)


### Documentation

* **auth:** add BRD for passwordless OTP login and email notifications ([7ea6e74](https://github.com/JCarran0/household-budgeting/commit/7ea6e74d430903113ea2103f45fdab007a96f118))

## [5.16.0](https://github.com/JCarran0/household-budgeting/compare/v5.15.0...v5.16.0) (2026-04-12)


### Features

* **family:** add personalized greetings and user attribution to edits ([7416685](https://github.com/JCarran0/household-budgeting/commit/74166852bf0cc3cab1e604e3a6dc3663cb401ebd))
* **tasks:** add Kanban task management with drag-and-drop, leaderboard, and templates ([2049e56](https://github.com/JCarran0/household-budgeting/commit/2049e56258c00ea91ec58b8952df72dae3dcb76a))

## [5.15.0](https://github.com/JCarran0/household-budgeting/compare/v5.14.0...v5.15.0) (2026-04-12)


### Features

* **family:** add account owner mapping UI and replace hardcoded formatter (Phase 9) ([89a3724](https://github.com/JCarran0/household-budgeting/commit/89a372433ae75dcfa8d86a841c16ef8fc5e4224d))
* **family:** add Family entity types, data model, and CRUD methods (Phase 1) ([96ca423](https://github.com/JCarran0/household-budgeting/commit/96ca4230fb97994de5e76d462eb3cf63756a6144))
* **family:** add family management API, join codes, and membership verification (Phase 5) ([efb9a22](https://github.com/JCarran0/household-budgeting/commit/efb9a223f941dbff03403cb04bf9511301bb2add))
* **family:** add frontend auth, settings page, and family management UI (Phase 8) ([baf7244](https://github.com/JCarran0/household-budgeting/commit/baf7244427d74f6771d1da408ccc5f9f3a52352d))
* **family:** add user profile API and account owner mapping service (Phases 6-7) ([beec2d0](https://github.com/JCarran0/household-budgeting/commit/beec2d0a8a720acdc3e4c4b0ea85eb3b4dc726ae))
* **family:** make auth system family-aware (Phase 2) ([ea4f348](https://github.com/JCarran0/household-budgeting/commit/ea4f3481dcd79286bdc0dde4ea0557fd89c23204))
* **family:** refactor data layer to family-scoped storage and add migration (Phases 3-4) ([02ce59c](https://github.com/JCarran0/household-budgeting/commit/02ce59c0ceeec7195b234d38f30ce0b537a03d5a))


### Bug Fixes

* **family:** auto-migrate pre-family users on login ([b748deb](https://github.com/JCarran0/household-budgeting/commit/b748deb024b342928637fa7cdedd75ff0b3c0ed6))


### Tests

* **family:** add integration tests for auth, sharing, and isolation (Phase 10) ([707c87d](https://github.com/JCarran0/household-budgeting/commit/707c87db7158bab30c92c9b87477e7c626106ac1))


### Documentation

* **family:** mark manual testing checklist complete ([6504887](https://github.com/JCarran0/household-budgeting/commit/6504887e94a4d987da4ff7326137f792f2519115))
* **tasks:** add BRD and implementation plan for household task management ([b42bfef](https://github.com/JCarran0/household-budgeting/commit/b42bfefe7c51cc8cf1c9d592e60dc1a8b97d249b))

## [5.14.0](https://github.com/JCarran0/household-budgeting/compare/v5.13.0...v5.14.0) (2026-04-11)


### Features

* **transactions:** add inline editing from transaction preview modal ([18cdbdd](https://github.com/JCarran0/household-budgeting/commit/18cdbddc582652c3a255a684b9d44e988786a94f))

## [5.13.0](https://github.com/JCarran0/household-budgeting/compare/v5.12.0...v5.13.0) (2026-04-10)


### Features

* **categorization:** allow editing transaction descriptions in AI cat flow ([2f0d0f4](https://github.com/JCarran0/household-budgeting/commit/2f0d0f4f0ab2ad63705334a8c6a81f12bef61e98))
* **transactions:** map account owner IDs to person names ([94504b0](https://github.com/JCarran0/household-budgeting/commit/94504b0da8140b735295ed9850504bacb52f304e))

## [5.12.0](https://github.com/JCarran0/household-budgeting/compare/v5.11.1...v5.12.0) (2026-04-10)


### Features

* **transactions:** add Run AutoCat button to uncategorized warning card ([afaaa01](https://github.com/JCarran0/household-budgeting/commit/afaaa019fe019a3beb362c20dd903bb4ff3d0318))


### Bug Fixes

* **autocat:** exclude split child transactions from categorization ([229288e](https://github.com/JCarran0/household-budgeting/commit/229288e186e6e2feaae20b076af56ab28b2f32bd))


### Code Refactoring

* **transactions:** extract AutoCat preview modal into shared component ([1db7685](https://github.com/JCarran0/household-budgeting/commit/1db768517b13a50e06bbfa2fc452082e2fe4dde0))

### [5.11.1](https://github.com/JCarran0/household-budgeting/compare/v5.11.0...v5.11.1) (2026-04-10)


### Bug Fixes

* **reports:** show only nearest series in chart tooltips ([522061e](https://github.com/JCarran0/household-budgeting/commit/522061e8d8aa165dbef1f9c5ead463e9b3f03521))

## [5.11.0](https://github.com/JCarran0/household-budgeting/compare/v5.10.3...v5.11.0) (2026-04-09)


### Features

* **projects:** add project tracking with tag-based budgeting ([5646e0d](https://github.com/JCarran0/household-budgeting/commit/5646e0dd3123135ee3dfa4001d91f1cf61a53874))

### [5.10.3](https://github.com/JCarran0/household-budgeting/compare/v5.10.2...v5.10.3) (2026-04-09)


### Bug Fixes

* **transactions:** create new URLSearchParams instead of mutating prev ([e5a60d2](https://github.com/JCarran0/household-budgeting/commit/e5a60d2c8f6d635a0539d87a32fafd8de03683b6))

### [5.10.2](https://github.com/JCarran0/household-budgeting/compare/v5.10.1...v5.10.2) (2026-04-09)


### Bug Fixes

* **reports:** remove form from useEffect deps to prevent infinite render loop ([5d87551](https://github.com/JCarran0/household-budgeting/commit/5d87551176e359d90431628a501634deadecc811))

### [5.10.1](https://github.com/JCarran0/household-budgeting/compare/v5.10.0...v5.10.1) (2026-04-09)


### Bug Fixes

* **reports:** tabs not switching due to stale URLSearchParams reference ([4e063f0](https://github.com/JCarran0/household-budgeting/commit/4e063f0c906d12e98761a11b80f171d3c361a3b6))

## [5.10.0](https://github.com/JCarran0/household-budgeting/compare/v5.9.0...v5.10.0) (2026-04-09)


### Features

* **ui:** add tooltip on hover for truncated MultiSelect pills ([0771467](https://github.com/JCarran0/household-budgeting/commit/0771467891dabe1db71387383d9af17ce3ffd27e))


### Bug Fixes

* **frontend:** resolve all 7 react-hooks/exhaustive-deps lint warnings ([0fcd1e2](https://github.com/JCarran0/household-budgeting/commit/0fcd1e2d87d2c322f984e2b5ea49b1057cd00fdb))
* **nginx:** add client_max_body_size for PDF uploads ([f649787](https://github.com/JCarran0/household-budgeting/commit/f649787df1778ff9da9fbacf40fead122eb5037d))

## [5.9.0](https://github.com/JCarran0/household-budgeting/compare/v5.8.0...v5.9.0) (2026-04-09)


### Features

* **transactions:** add account owner, original description, and location display ([2326b0d](https://github.com/JCarran0/household-budgeting/commit/2326b0df62e25f2b982ebf891c19a4d3c00dc185))


### Bug Fixes

* **ci:** add PLAID_ENCRYPTION_SECRET to deploy workflow .env templates ([ff6e284](https://github.com/JCarran0/household-budgeting/commit/ff6e2844d68f30d658afeaf08336b3badfbc8dc6))


### Code Refactoring

* **test:** remove unnecessary symlink copy/restore from test scripts ([5769db5](https://github.com/JCarran0/household-budgeting/commit/5769db5c990164369827293dd262b9beb183823e))


### Documentation

* add git push rebase guidance for CI changelog commits ([5bc3925](https://github.com/JCarran0/household-budgeting/commit/5bc39259f6a221d51426d459306d7d5b04ba2e04))

## [5.8.0](https://github.com/JCarran0/household-budgeting/compare/v5.7.15...v5.8.0) (2026-04-09)


### Features

* **amazon-receipts:** add shared types, upload infrastructure, and route scaffold (Phases 1–2) ([7a69a5d](https://github.com/JCarran0/household-budgeting/commit/7a69a5d18bdccb4bad21e174068273dd0885a957))
* **amazon-receipts:** implement PDF parsing, matching, categorization, and full UI (Phases 3–9) ([00d6277](https://github.com/JCarran0/household-budgeting/commit/00d627764c552f10f239ffaa0ffc6d6970cf2661))


### Bug Fixes

* **frontend:** use store logout on 401 and remove stale router types ([e10b175](https://github.com/JCarran0/household-budgeting/commit/e10b1758d7df924e84c68fa38427f3d61ccccf1b))
* resolve stale closure bug, add cost display, dev port conflicts, and theme loop ([ab16640](https://github.com/JCarran0/household-budgeting/commit/ab16640afaac3f4dc3522db178d644afded404b4))
* **search:** include userDescription in transaction search filter ([5e85278](https://github.com/JCarran0/household-budgeting/commit/5e85278982a64127ff578712dd77430fb6d27314))
* **security:** decouple encryption secret, remove token logging, pin JWT algorithm ([ef24737](https://github.com/JCarran0/household-budgeting/commit/ef247375110e03561423ef0c67bf3e8b0fcff1fb))
* **test:** mock config module in encryption environment tests ([472f97a](https://github.com/JCarran0/household-budgeting/commit/472f97aaa49e40e17c1c2b40b8379dc73090ffd0))


### Code Refactoring

* **amazon-receipts:** smarter dedup, unified AI menu, delete-all endpoint ([5f80ffd](https://github.com/JCarran0/household-budgeting/commit/5f80ffd67010bca98f463d8e0edf34610852bd2e))

### [5.7.15](https://github.com/JCarran0/household-budgeting/compare/v5.7.14...v5.7.15) (2026-04-09)


### Code Refactoring

* **frontend:** extract hooks from EnhancedTransactions (TD-11) ([4dca963](https://github.com/JCarran0/household-budgeting/commit/4dca963648da307c1450e79d294be9734cc8b226))


### Documentation

* archive tech debt tracker — all actionable items resolved ([f711ee0](https://github.com/JCarran0/household-budgeting/commit/f711ee043ca914ddf170a69a1d84efd40296a28e)), closes [#7](https://github.com/JCarran0/household-budgeting/issues/7) [#8](https://github.com/JCarran0/household-budgeting/issues/8) [#9](https://github.com/JCarran0/household-budgeting/issues/9)
* mark TD-11 as resolved ([5e2ddd5](https://github.com/JCarran0/household-budgeting/commit/5e2ddd5a3e565bda74023ca1786783291f21b6f7))

### [5.7.14](https://github.com/JCarran0/household-budgeting/compare/v5.7.13...v5.7.14) (2026-04-09)


### Performance Improvements

* **reports:** replace N monthly budget requests with yearly batch (TD-1) ([5ed0bb9](https://github.com/JCarran0/household-budgeting/commit/5ed0bb94c82c7bfdb8055774037558cb1764e5e2))


### Code Refactoring

* **frontend:** split api/misc.ts into 7 domain modules (TD-12) ([0cfd902](https://github.com/JCarran0/household-budgeting/commit/0cfd90243533d204e1632140857045278535a5fe))
* **routes:** migrate remaining 11 routes to typed error patterns (TD-10) ([8d9243e](https://github.com/JCarran0/household-budgeting/commit/8d9243e7a49d5ad52fb70ec1f361b8de6ddeff36))


### Documentation

* mark resolved tech debt items and complete doc audit ([750d35c](https://github.com/JCarran0/household-budgeting/commit/750d35cdd388678faf1de715368a8238fe0ed7a3))

### [5.7.13](https://github.com/JCarran0/household-budgeting/compare/v5.7.12...v5.7.13) (2026-04-09)


### Documentation

* audit and update AI documentation suite ([35d71fe](https://github.com/JCarran0/household-budgeting/commit/35d71feaa11c97c8ca20c2c43214888b8bc29e3c)), closes [#3](https://github.com/JCarran0/household-budgeting/issues/3) [#4](https://github.com/JCarran0/household-budgeting/issues/4) [#5](https://github.com/JCarran0/household-budgeting/issues/5) [#6](https://github.com/JCarran0/household-budgeting/issues/6) [#10](https://github.com/JCarran0/household-budgeting/issues/10) [#11](https://github.com/JCarran0/household-budgeting/issues/11) [#12](https://github.com/JCarran0/household-budgeting/issues/12)

### [5.7.12](https://github.com/JCarran0/household-budgeting/compare/v5.7.11...v5.7.12) (2026-04-09)


### Documentation

* move completed refactor plan to docs/completed/ ([616ae7c](https://github.com/JCarran0/household-budgeting/commit/616ae7cce66b7436ea71044a51e4f3b3fea2bc5c))

### [5.7.11](https://github.com/JCarran0/household-budgeting/compare/v5.7.10...v5.7.11) (2026-04-09)


### Code Refactoring

* **frontend:** decompose EnhancedTransactions.tsx into sections (R5) ([e995ed7](https://github.com/JCarran0/household-budgeting/commit/e995ed76b2549861662cf9e58c9fba69b4d0e5a7))


### Documentation

* update refactor plan with R5 completion — all 10 items done ([70d22d3](https://github.com/JCarran0/household-budgeting/commit/70d22d3fa4e78e663712a66755d5adac60d30694))

### [5.7.10](https://github.com/JCarran0/household-budgeting/compare/v5.7.9...v5.7.10) (2026-04-09)


### Code Refactoring

* **frontend:** decompose Reports.tsx into section components (R4) ([afb0a6f](https://github.com/JCarran0/household-budgeting/commit/afb0a6fc8a98f894bc630b3d6e1fd8033cacb659))


### Documentation

* update refactor plan with R4 completion status ([39796cf](https://github.com/JCarran0/household-budgeting/commit/39796cf7a957ae7720644e375672fbcb0b5508ea))

### [5.7.9](https://github.com/JCarran0/household-budgeting/compare/v5.7.8...v5.7.9) (2026-04-09)


### Documentation

* drop frontend test infra prerequisite for R4/R5 ([cde43be](https://github.com/JCarran0/household-budgeting/commit/cde43be578557032e99a0bcfba65fb4f63c227ca))

### [5.7.8](https://github.com/JCarran0/household-budgeting/compare/v5.7.7...v5.7.8) (2026-04-09)


### Bug Fixes

* resolve merge conflicts from stash pop on remote ([7ebcc45](https://github.com/JCarran0/household-budgeting/commit/7ebcc450996b222999870067c5215edba68c5cd0))

### [5.7.7](https://github.com/JCarran0/household-budgeting/compare/v5.7.6...v5.7.7) (2026-04-09)


### Code Refactoring

* **routes:** move business logic to services and apply error patterns (R9) ([753ebd5](https://github.com/JCarran0/household-budgeting/commit/753ebd5fcae3e81b8981af6a64a537dd073b4af4))


### Documentation

* update refactor plan with R9 completion — Phase 4 complete ([16441a0](https://github.com/JCarran0/household-budgeting/commit/16441a0eda8caa3466c0201bbdb086092153f3e8))

### [5.7.6](https://github.com/JCarran0/household-budgeting/compare/v5.7.5...v5.7.6) (2026-04-08)


### Code Refactoring

* **frontend:** split API client into domain modules (R7) ([4373790](https://github.com/JCarran0/household-budgeting/commit/4373790109fa5c1c3e9c8073425856793ef37d9d))


### Documentation

* update refactor plan with R7 completion status ([2d8d8e0](https://github.com/JCarran0/household-budgeting/commit/2d8d8e0de389881aa2cc801cf9fa644cee8b2df4))

### [5.7.5](https://github.com/JCarran0/household-budgeting/compare/v5.7.4...v5.7.5) (2026-04-08)


### Documentation

* fix stale notes in refactor plan ([0b41b36](https://github.com/JCarran0/household-budgeting/commit/0b41b36e9ed568dfa31f79669b46f979bdbbfd65))

### [5.7.4](https://github.com/JCarran0/household-budgeting/compare/v5.7.3...v5.7.4) (2026-04-08)


### Code Refactoring

* **errors:** add typed error classes and error middleware (R6) ([98bf9a2](https://github.com/JCarran0/household-budgeting/commit/98bf9a2866ad82e428741afa30c4a1346d97214f))


### Documentation

* update refactor plan with R6 completion — Phase 2 complete ([0b1c087](https://github.com/JCarran0/household-budgeting/commit/0b1c087347bd334490859500c2bfad6176f58856))

### [5.7.3](https://github.com/JCarran0/household-budgeting/compare/v5.7.2...v5.7.3) (2026-04-08)


### Tests

* **reports:** add 35 unit tests for ReportService (R3 prep) ([08811e9](https://github.com/JCarran0/household-budgeting/commit/08811e9510900a248a292d25a33db01b626f23e2))


### Code Refactoring

* **reports:** extract helpers and use Repository (R3) ([7a90096](https://github.com/JCarran0/household-budgeting/commit/7a90096ef83579d8b57e838fd2b49025fe6b0655))


### Documentation

* update refactor plan with R3 completion status ([28cef60](https://github.com/JCarran0/household-budgeting/commit/28cef60514441b37e0f06391e031d6ac3f4b0adb))

### [5.7.2](https://github.com/JCarran0/household-budgeting/compare/v5.7.1...v5.7.2) (2026-04-08)


### Tests

* **transactions:** add 112 unit tests for TransactionService (R1 prep) ([0c1d9e7](https://github.com/JCarran0/household-budgeting/commit/0c1d9e708a953076bba5040ecdcc170564317f43))


### Code Refactoring

* **transactions:** extract filter engine and use Repository (R1) ([1171718](https://github.com/JCarran0/household-budgeting/commit/117171898c5e6c977cb8eec952bd71d6204d155f))


### Documentation

* update refactor plan with R1 completion status ([01c9145](https://github.com/JCarran0/household-budgeting/commit/01c91452d1414f5f08c0554a7ed4f79715d8c456))

### [5.7.1](https://github.com/JCarran0/household-budgeting/compare/v5.7.0...v5.7.1) (2026-04-08)


### Bug Fixes

* resolve merge conflicts in report components ([10d8c03](https://github.com/JCarran0/household-budgeting/commit/10d8c0390a7dd36b3a1cd9f115c559c987df27fd))


### Code Refactoring

* **config:** add centralized config module with Zod validation (R10) ([5d0eea4](https://github.com/JCarran0/household-budgeting/commit/5d0eea40f4bde51d7b22c4ffa64fc5bd2c757936))
* **data:** add generic Repository base class (R8) ([fbe27b1](https://github.com/JCarran0/household-budgeting/commit/fbe27b1441dfdc5ca86798c13a216f675e790127))
* **services:** fix circular dependencies and remove as-any casts (R2) ([034fab0](https://github.com/JCarran0/household-budgeting/commit/034fab0f332740cc4e9c9619608d5ca5499e5fd2))


### Documentation

* add maintainability refactor plan with test-first approach ([c148220](https://github.com/JCarran0/household-budgeting/commit/c148220660f1589e24f8ad529adc9ad4c2bdc838))
* sync refactor plan with current progress ([29b8855](https://github.com/JCarran0/household-budgeting/commit/29b88555edc79d67830163c28f1f477911b975a0))
* update refactor plan with R10 completion status ([10dd869](https://github.com/JCarran0/household-budgeting/commit/10dd869530a80045e6f5dbb606212fca9e8955ca))
* update refactor plan with R8 and R2 completion status ([df9f5ef](https://github.com/JCarran0/household-budgeting/commit/df9f5efa85dcb88808eaef1aaeb18ebabd512911))

## [5.7.0](https://github.com/JCarran0/household-budgeting/compare/v5.6.0...v5.7.0) (2026-04-08)


### Features

* **reports:** make budget tab actual amounts clickable for transaction preview ([ca1d6de](https://github.com/JCarran0/household-budgeting/commit/ca1d6de742049258310eaf2a062bd62a2d8dcbcb))
* **ui:** persist active tab on Reports and Accounts pages ([77780fc](https://github.com/JCarran0/household-budgeting/commit/77780fc4dd0c74616544baa41852d182a60cbb31))

## [5.6.0](https://github.com/JCarran0/household-budgeting/compare/v5.5.0...v5.6.0) (2026-04-08)


### Features

* **accounts:** add manual accounts for complete net worth tracking ([dd2d1a7](https://github.com/JCarran0/household-budgeting/commit/dd2d1a7c9efa9baa40e2c776e819590f8b0ba811))

## [5.5.0](https://github.com/JCarran0/household-budgeting/compare/v5.4.0...v5.5.0) (2026-04-08)


### Features

* **dashboard:** add projected net income KPI card ([ccd6161](https://github.com/JCarran0/household-budgeting/commit/ccd616170a4a738b2296770c2e11bfd142471acf))
* **transactions:** show account name in list view and edit modal ([e4c1db2](https://github.com/JCarran0/household-budgeting/commit/e4c1db29483ed6e67e65625d65d27928feb93cae))


### Bug Fixes

* **transactions:** use raw amount for min/max filters instead of Math.abs ([535460f](https://github.com/JCarran0/household-budgeting/commit/535460fd695f58ccafe97c1e07841bbb702c2ccc))


### Documentation

* **transfer-linking:** shelve BRD and document one-sided Venmo transfer finding ([ceb2262](https://github.com/JCarran0/household-budgeting/commit/ceb22625cc0db9e596ef57a90190984c5e3443d2))

## [5.4.0](https://github.com/JCarran0/household-budgeting/compare/v5.3.0...v5.4.0) (2026-04-07)


### Features

* **admin:** add light/dark color scheme toggle and fix theme save crash ([cbbd9fa](https://github.com/JCarran0/household-budgeting/commit/cbbd9faa12b9623316ee38eff8fd19691e7a36ea))
* **admin:** add theme customizer with backend persistence and auto-shade generation ([971ed81](https://github.com/JCarran0/household-budgeting/commit/971ed81765d4a34ba14d445a60d2a35049a86b33))
* **admin:** default to light color scheme and theme tab ([58d7399](https://github.com/JCarran0/household-budgeting/commit/58d73990fa18451b83ebe5f5b08c6d56724452e9))


### Documentation

* **theme:** update plan to completed status with implementation decisions ([caf9414](https://github.com/JCarran0/household-budgeting/commit/caf9414ad3e78b70c7514919d9f7f530c88fd921))

## [5.3.0](https://github.com/JCarran0/household-budgeting/compare/v5.2.1...v5.3.0) (2026-04-07)


### Features

* **reports:** add Budgets tab with 5 budget health widgets ([772ba4c](https://github.com/JCarran0/household-budgeting/commit/772ba4c9a3b4f1eca871e6d9c0d224a3082e1459))


### Bug Fixes

* **budgets:** show pending value in grid cells while batch save is in-flight ([f045ecb](https://github.com/JCarran0/household-budgeting/commit/f045ecbb60842386bbad6376dd28efb403c59ce0))
* **budgets:** skip no-op updates when tabbing across yearly grid cells ([2392d71](https://github.com/JCarran0/household-budgeting/commit/2392d71cd15a06a83d29706da227823c528d84d5))
* **reports:** make KPI cards respect global date filter and default to YTD ([c59637c](https://github.com/JCarran0/household-budgeting/commit/c59637cf1e5b0406ac32a425b41622048305e544))

### [5.2.1](https://github.com/JCarran0/household-budgeting/compare/v5.2.0...v5.2.1) (2026-04-07)


### Bug Fixes

* **reports:** update validTabs to match actual tab values ([2ecac9a](https://github.com/JCarran0/household-budgeting/commit/2ecac9ae1271970a8aed4dd867d36f4567c21370))


### Documentation

* **transfers:** add BRD and implementation plan for transfer linking ([d547b93](https://github.com/JCarran0/household-budgeting/commit/d547b9380aef2f503b6e0e17787250a379297c4e))

## [5.2.0](https://github.com/JCarran0/household-budgeting/compare/v5.1.0...v5.2.0) (2026-04-06)


### Features

* **transactions:** redesign filter layout with unified dropdown row ([c5fe85f](https://github.com/JCarran0/household-budgeting/commit/c5fe85fff7b90f6a46444e95ab78bf5f09c06521))

## [5.1.0](https://github.com/JCarran0/household-budgeting/compare/v5.0.3...v5.1.0) (2026-04-06)


### Features

* **categories:** allow changing parent category via edit modal ([afb856b](https://github.com/JCarran0/household-budgeting/commit/afb856b8792d2eb0259a5c8cab63df10a20c74c0))
* **transactions:** add isFlagged field for flagging transactions ([f3e5ecc](https://github.com/JCarran0/household-budgeting/commit/f3e5ecc1d48e0b0646988f273c26718aac2f91f3))

### [5.0.3](https://github.com/JCarran0/household-budgeting/compare/v5.0.2...v5.0.3) (2026-04-06)


### Bug Fixes

* **categories:** remove redundant deletion success toast ([db8dd27](https://github.com/JCarran0/household-budgeting/commit/db8dd27f3ec3631a35e7f82a9ca65f0251a9b7fb))

### [5.0.2](https://github.com/JCarran0/household-budgeting/compare/v5.0.1...v5.0.2) (2026-04-06)


### Bug Fixes

* **budgets:** allow zero amount in budget validation schema ([5d3e87c](https://github.com/JCarran0/household-budgeting/commit/5d3e87c5d9874a668788aae96e140f78069abb8f))

### [5.0.1](https://github.com/JCarran0/household-budgeting/compare/v5.0.0...v5.0.1) (2026-04-06)


### Bug Fixes

* **budgets:** allow zeroing out budgets in yearly grid view ([6b9a1bd](https://github.com/JCarran0/household-budgeting/commit/6b9a1bd174ba80f7b26937750fb91495fb3590fd))
* **categories:** surface duplicate pattern errors in rule updates ([d69b8a3](https://github.com/JCarran0/household-budgeting/commit/d69b8a3a5f8d5b3b5f4ada00d8d75ffae79585a7))
* **transactions:** read dateFilter URL param on page init ([c04b55a](https://github.com/JCarran0/household-budgeting/commit/c04b55ae729d9bea60fbcea9a964ebb4508b1a28))
* **transactions:** reset filters before applying inbound URL params ([c6ccc75](https://github.com/JCarran0/household-budgeting/commit/c6ccc75c3d8e24b2a0a59126882eb72ae32f4003))


### CI/CD

* add concurrency group to cancel superseded deploys ([d3024eb](https://github.com/JCarran0/household-budgeting/commit/d3024ebe7d8712bd2f2544766bb1a4f30d0c8a3d))
* auto-deploy to production on push to main ([39a07e7](https://github.com/JCarran0/household-budgeting/commit/39a07e7dec11f59da574cbbb2b71cda81434345a))
* move auto-deploy trigger to release-and-deploy workflow ([bcf7629](https://github.com/JCarran0/household-budgeting/commit/bcf76290c770cac8bca577875b9154e4da0c4cac))

## [5.0.0](https://github.com/JCarran0/household-budgeting/compare/v4.2.0...v5.0.0) (2026-04-06)


### Features

* **categories:** add detailed preview modal for auto-categorization ([266068b](https://github.com/JCarran0/household-budgeting/commit/266068b1b0f26c5c9b6043beebe660b02c5e623f))
* **transactions:** add expanded time range filters and consolidate with reports ([817f13b](https://github.com/JCarran0/household-budgeting/commit/817f13b89669554c077a6261f83564fa137460a2))


### Bug Fixes

* **transactions:** remove distracting filters applied toast ([a6e2f4c](https://github.com/JCarran0/household-budgeting/commit/a6e2f4c011051b87603c556ffa1c171da2d0a836))

## [4.2.0](https://github.com/JCarran0/household-budgeting/compare/v4.1.0...v4.2.0) (2026-04-06)


### Bug Fixes

* **categories:** correct transaction count badge and accordion behavior ([25022c7](https://github.com/JCarran0/household-budgeting/commit/25022c7de0bfa8584d6fdbd46d95cbe23476a1f5))


### Documentation

* update CLAUDE.md, deployment guide, and .env.example for AI features ([e1a2842](https://github.com/JCarran0/household-budgeting/commit/e1a2842e1ac19192466eb5f54e6c116cb370f974))

## [4.1.0](https://github.com/JCarran0/household-budgeting/compare/v4.0.1...v4.1.0) (2026-04-06)


### Bug Fixes

* **categorization:** propagate batch classification errors ([f2803d9](https://github.com/JCarran0/household-budgeting/commit/f2803d9ba6022c6ce7c99b2ea7477ce139f42ddd))

### [4.0.1](https://github.com/JCarran0/household-budgeting/compare/v4.0.0...v4.0.1) (2026-04-06)


### Bug Fixes

* **categorization:** add proper error state and progress logging ([08fa8a3](https://github.com/JCarran0/household-budgeting/commit/08fa8a39e8c2ee68814822c0bb833d91c62ff157))


### CI/CD

* add AI feature env vars to deploy workflows ([e60eed7](https://github.com/JCarran0/household-budgeting/commit/e60eed7247d03f54e73d54c00b1b649a9453293f))


### Documentation

* update plans with completed phase statuses ([e7ed3ce](https://github.com/JCarran0/household-budgeting/commit/e7ed3cee60016ec58d064b20bea7f40f38265839))

## [4.0.0](https://github.com/JCarran0/household-budgeting/compare/v3.0.0...v4.0.0) (2026-04-06)


### Features

* **backend:** add chatbot API routes with rate limiting ([fdc937f](https://github.com/JCarran0/household-budgeting/commit/fdc937f16e8721d7be56ef43ab033fe361fd069f))
* **backend:** add ChatbotDataService with read-only data boundary ([f502a0b](https://github.com/JCarran0/household-budgeting/commit/f502a0b327d89cc500aacc16ff03fbe7ead02b09))
* **backend:** add ChatbotService orchestration with cost tracking ([3423fe6](https://github.com/JCarran0/household-budgeting/commit/3423fe699087a5f6aa09004f5285c0ab0b054ad6))
* **frontend:** add chat overlay UI with FAB and message components ([22438de](https://github.com/JCarran0/household-budgeting/commit/22438de73cfb290264f4052beaceee0980988daa))
* **frontend:** add chatbot API client methods ([666142a](https://github.com/JCarran0/household-budgeting/commit/666142a155e0cb3788ac0c9d184ff77cf46923fe))
* **frontend:** add URL-based page state for chatbot context ([d2e4d16](https://github.com/JCarran0/household-budgeting/commit/d2e4d16963cdd8e68eaf9bcc74ca0ea93eaa5660))
* implement AI-powered bulk transaction categorization ([7e4c1ad](https://github.com/JCarran0/household-budgeting/commit/7e4c1adc6ff78a932edf514fc4adb3f0d036eb2f))
* **shared:** add chatbot types and tool schemas ([03312ee](https://github.com/JCarran0/household-budgeting/commit/03312ee03df651883e151275f690ad74e9bd697a))
* **transactions:** sync filter state to URL params ([8faf168](https://github.com/JCarran0/household-budgeting/commit/8faf168fe652288285034cc6d8b9eceb5459a10f))


### Bug Fixes

* **chatbot:** correct model IDs, pricing, and add uncategorized filter ([fe27ceb](https://github.com/JCarran0/household-budgeting/commit/fe27ceb5aa21b0bdbdcd1e20cea0ae8b16dcf124))


### Documentation

* **categorization:** add AI bulk categorization BRD ([57c3664](https://github.com/JCarran0/household-budgeting/commit/57c3664ea5e5ab079f9a7a524552bc6afd32e89c))
* **categorization:** add AI bulk categorization implementation plan ([9b26203](https://github.com/JCarran0/household-budgeting/commit/9b2620308a7e04a6d21a9fc316ea59cbb9b9888a))

## [3.0.0](https://github.com/JCarran0/household-budgeting/compare/v2.0.1...v3.0.0) (2026-04-05)


### Features

* **theme:** centralize color system with Sage & Stone palette ([1c411db](https://github.com/JCarran0/household-budgeting/commit/1c411dbc831198d5e93a0f4e416384d58a60547c))


### Documentation

* **chatbot:** harden BRD and plan after staff engineer review ([bd5a661](https://github.com/JCarran0/household-budgeting/commit/bd5a661ad3d3cbe6e90f14da4b68b003ff6ec987))
* **travel:** mark travel tagging plan as complete ([f10271d](https://github.com/JCarran0/household-budgeting/commit/f10271dde5f9432a9ba7c96ae0efbcb5c0273ab5))


### Styling

* **theme:** brighten dark scale for more visible sage undertone ([f15221d](https://github.com/JCarran0/household-budgeting/commit/f15221de10e9f12956c1a38d0d7ed96adf45e9a5))
* **theme:** switch to peach cream + olive/amber palette ([24a0823](https://github.com/JCarran0/household-budgeting/commit/24a0823fe87df0004520de2c863f3361432d294b))

### [2.0.1](https://github.com/JCarran0/household-budgeting/compare/v2.0.0...v2.0.1) (2026-04-05)


### Features

* **transactions:** add bulk add/remove tags support ([e5ff9ed](https://github.com/JCarran0/household-budgeting/commit/e5ff9ed7daee168209bb6e48ebd7747e2531eb5a))


### Bug Fixes

* **transactions:** apply tags URL param to transaction filters ([e44b681](https://github.com/JCarran0/household-budgeting/commit/e44b6819a8c7d0d5d307f83eb176123c3b03535d))
* **trips:** correct spending calculation and uncategorized drill-down ([4a727f6](https://github.com/JCarran0/household-budgeting/commit/4a727f63b1a98ec0d069ca9ac0c3bcb98c64c765))


### Documentation

* **chatbot:** add AI financial chatbot BRD ([2e00ccb](https://github.com/JCarran0/household-budgeting/commit/2e00ccb7dc92b8de9b32c75de275130f11ff0d84))

## [2.0.0](https://github.com/JCarran0/household-budgeting/compare/v1.23.2...v2.0.0) (2026-04-05)


### Features

* **trips:** implement travel tagging & trip management ([f5eda82](https://github.com/JCarran0/household-budgeting/commit/f5eda82af1f4a374657814ed10e16b0991f0c96e))


### Code Refactoring

* **categories:** consolidate category option builders into useCategoryOptions hook ([6565c39](https://github.com/JCarran0/household-budgeting/commit/6565c39baad7bd54b6c3e9609122c7e041e54a0a))


### Documentation

* **travel:** add travel tagging BRD, implementation plan, and project plan updates ([8dad9bc](https://github.com/JCarran0/household-budgeting/commit/8dad9bcfed1234dfc52132d132001dd6296805fd))

### [1.23.2](https://github.com/JCarran0/household-budgeting/compare/v1.23.1...v1.23.2) (2026-04-05)


### Bug Fixes

* **transactions:** include parent name in filter subcategory labels ([ec7b9e7](https://github.com/JCarran0/household-budgeting/commit/ec7b9e7ca44214472ca0e382b7dabd34f69f5c3a))
* **transactions:** use flat category options for inline picker and bulk edit ([2c27b54](https://github.com/JCarran0/household-budgeting/commit/2c27b5484fd494ad7eeddf7bc1efb97a98b82c88))

### [1.23.1](https://github.com/JCarran0/household-budgeting/compare/v1.23.0...v1.23.1) (2026-02-16)


### Bug Fixes

* **accounts:** use single-account sync endpoint for per-account sync button ([dadf865](https://github.com/JCarran0/household-budgeting/commit/dadf8658cd78312c0a57ca6d6f3d9eb93faa72c0))
* **categories:** fix "0 associated transactions" deletion error ([43d4977](https://github.com/JCarran0/household-budgeting/commit/43d49774cc3791b3d0ba7d13594ed9e3eccd782f))
* **transactions:** send empty object body in sync request to satisfy backend validation ([cb1746a](https://github.com/JCarran0/household-budgeting/commit/cb1746ae39f6d777bbd63fe186931a66ae7162a7))


### Documentation

* add re-authentication flow documentation ([3cc96bd](https://github.com/JCarran0/household-budgeting/commit/3cc96bde052ac77c0709e76bbc2ef6583aa28591))

## [1.23.0](https://github.com/JCarran0/household-budgeting/compare/v1.22.0...v1.23.0) (2026-01-24)


### Features

* **accounts:** add bank sign-in flow for re-authentication ([a374b1b](https://github.com/JCarran0/household-budgeting/commit/a374b1bb599e26ded16c716be89c9ca68bf23319))
* **accounts:** add visual indicators for accounts requiring reconnection ([69b5efb](https://github.com/JCarran0/household-budgeting/commit/69b5efb25eb9cb573b84ebba5aae69aeb0bbc530))
* **categories:** add guided deletion workflow with dependency cleanup ([7845f9d](https://github.com/JCarran0/household-budgeting/commit/7845f9dda5bdd0475248abea1f7f5da529a72644))


### Bug Fixes

* **budgets:** correct sticky header behavior in yearly budget grid ([7b71887](https://github.com/JCarran0/household-budgeting/commit/7b71887a98d95e44dd5680bec06ce700106b3da3))

## [1.22.0](https://github.com/JCarran0/household-budgeting/compare/v1.21.0...v1.22.0) (2025-10-18)


### Features

* **budgets:** implement proper sticky header for yearly view table ([5ec8a7b](https://github.com/JCarran0/household-budgeting/commit/5ec8a7bc7665031dda8059273b53d96ae6a9866b))


### Bug Fixes

* **dashboard:** correct net worth calculation to account for liabilities ([2b94ecb](https://github.com/JCarran0/household-budgeting/commit/2b94ecb5f80f0e7099f2a60f6e1ed71697178f0a))
* **layout:** remove excessive left margin by removing AppShell padding ([05f0de3](https://github.com/JCarran0/household-budgeting/commit/05f0de3766eb8aa263417c3e1114d48b76fd1ac1))
* **reports:** correct timezone bug in cash flow projections display ([5cef8fd](https://github.com/JCarran0/household-budgeting/commit/5cef8fdf28a4e95d6a1c40c6a987c3fb24e386f8))


### Styling

* **budgets:** improve yearly view table styling and layout ([ee84383](https://github.com/JCarran0/household-budgeting/commit/ee84383a33d98630214ddc7d626e9f8cd1a77e28))
* **reports:** update Planned vs Actual Spending colors to light blue ([0fd0b1e](https://github.com/JCarran0/household-budgeting/commit/0fd0b1efdb5816b9758ed825ebc187f2089ec498)), closes [#ef4444](https://github.com/JCarran0/household-budgeting/issues/ef4444) [#4ad4](https://github.com/JCarran0/household-budgeting/issues/4ad4) [#dc2626](https://github.com/JCarran0/household-budgeting/issues/dc2626) [#60e0](https://github.com/JCarran0/household-budgeting/issues/60e0)

## [1.21.0](https://github.com/JCarran0/household-budgeting/compare/v1.20.2...v1.21.0) (2025-10-15)


### Features

* **reports:** overhaul cash flow projections with budget comparison ([594432c](https://github.com/JCarran0/household-budgeting/commit/594432c8d1b09682a33f54d85f146cfe650d280f))


### Bug Fixes

* **budgets:** correct Budget Performance Summary calculations ([5b982f8](https://github.com/JCarran0/household-budgeting/commit/5b982f89e5979f05fe2682656fb66fdfe4821e3c))

### [1.20.2](https://github.com/JCarran0/household-budgeting/compare/v1.20.1...v1.20.2) (2025-10-14)


### Bug Fixes

* **nginx:** increase rate limits to handle Reports page load ([ba1d52d](https://github.com/JCarran0/household-budgeting/commit/ba1d52d67e2c590f073e1a133df4b61453626bd3)), closes [#1](https://github.com/JCarran0/household-budgeting/issues/1)

### [1.20.1](https://github.com/JCarran0/household-budgeting/compare/v1.20.0...v1.20.1) (2025-10-14)


### Bug Fixes

* **nginx:** increase rate limits to handle Reports page load ([36d46b6](https://github.com/JCarran0/household-budgeting/commit/36d46b6b76a79f72fa710b95a882f7b45e0365c1))

## [1.20.0](https://github.com/JCarran0/household-budgeting/compare/v1.19.0...v1.20.0) (2025-10-14)


### Features

* **budget:** enhance budget feedback with fun messages and 3-tier tolerance system ([ac2fd14](https://github.com/JCarran0/household-budgeting/commit/ac2fd14b1c0d3d88945e7cf1648c19dc066f7513))


### Bug Fixes

* **actuals-override:** fix timezone bugs causing month offset and display issues ([0a3806d](https://github.com/JCarran0/household-budgeting/commit/0a3806de08b46de0c7c9c3e698b539cf120eebf2))
* **api:** handle missing CHANGELOG.md gracefully in changelog endpoint ([e80f26b](https://github.com/JCarran0/household-budgeting/commit/e80f26b3b109343c4da16359a246bb45692bce02))
* **dashboard:** correct budget calculation using shared utilities for expense-only totals ([ca27880](https://github.com/JCarran0/household-budgeting/commit/ca27880e955f44727d9b5944d130fa74b63bf771))
* **deploy:** consolidate deployment scripts and use correct CHANGELOG.md logic ([b3b3ff7](https://github.com/JCarran0/household-budgeting/commit/b3b3ff79beaeaddba9f98729e2580da15453e945))
* **reports:** correct YTD average calculation to only count months with data ([a0e7a26](https://github.com/JCarran0/household-budgeting/commit/a0e7a2604dc0a156575979f9dcfc25694c962fa1))


### Chores

* convert backend/src/shared symlink to actual directory ([f68ceef](https://github.com/JCarran0/household-budgeting/commit/f68ceef3aeb94822e79d0b954d66a93265bffaa9))
* restore backend/src/shared as symlink ([dd1cbd9](https://github.com/JCarran0/household-budgeting/commit/dd1cbd9a69a020da1f8a5a8674c01af1bd8a8e83))

## [1.19.0](https://github.com/JCarran0/household-budgeting/compare/v1.18.0...v1.19.0) (2025-09-21)


### Features

* **dev:** add production data sync utility for local debugging ([91f4ab9](https://github.com/JCarran0/household-budgeting/commit/91f4ab9b1044fb5fb3bc44d557f535da2c220642))


### Bug Fixes

* **accounts:** map institutionName to institution for frontend compatibility ([bd9d5b1](https://github.com/JCarran0/household-budgeting/commit/bd9d5b171c01763e709a8e6ddd7cb94b83548592))
* **dashboard:** correct monthly spending calculation using shared utilities ([ed1d769](https://github.com/JCarran0/household-budgeting/commit/ed1d76901db4b8b9bb0957a0d728ebfdffca6398))

## [1.18.0](https://github.com/JCarran0/household-budgeting/compare/v1.17.0...v1.18.0) (2025-09-21)


### Features

* **budgets:** add sticky headers to all budget grid components ([f288250](https://github.com/JCarran0/household-budgeting/commit/f288250e1d44a917813e74aee42d2b9f4c2a00f1))


### Bug Fixes

* **auth:** resolve JWT token storage conflict causing authentication failures ([cb5e28c](https://github.com/JCarran0/household-budgeting/commit/cb5e28cab0611826ce9da1ce6272e247c5ac3147))

## [1.17.0](https://github.com/JCarran0/household-budgeting/compare/v1.16.3...v1.17.0) (2025-09-21)


### Features

* **budgets:** add yearly budget grid view with inline editing and auto-save ([c127fce](https://github.com/JCarran0/household-budgeting/commit/c127fce6cfa8d5ee9ec4ccba435f4aea630e184e))
* **budgets:** implement true batch editing with smart UX for yearly budget grid ([8d393cb](https://github.com/JCarran0/household-budgeting/commit/8d393cbec34b111a9697202c60d8bcde401d6ca8))
* **categories:** add explicit isIncome property with performance optimization ([a6e8a21](https://github.com/JCarran0/household-budgeting/commit/a6e8a21f6226a1e08d2adcfbc800a95771af622a))
* **categories:** enhance error messages for category deletion with transaction details ([b40813c](https://github.com/JCarran0/household-budgeting/commit/b40813ca80a077bbf5bd54156f2394fa21309adb))
* **transactions:** add grouped category filter with parent selection ([56f3145](https://github.com/JCarran0/household-budgeting/commit/56f314573b1bcb2ebf1e50c8deb2be1af570269c))


### Bug Fixes

* **budgets:** eliminate excessive API calls in yearly budget grid auto-save ([bc2113f](https://github.com/JCarran0/household-budgeting/commit/bc2113fda237abf89775730d21b9729079a0682b))
* **budgets:** prevent duplicate toast notifications in yearly budget grid ([2bed3b1](https://github.com/JCarran0/household-budgeting/commit/2bed3b16b4348980de2976e20f2421f23409d808))
* **build:** resolve shared utilities import path issues causing deployment failures ([a14b33d](https://github.com/JCarran0/household-budgeting/commit/a14b33da6559916ec930508868e4ac565ad5e2ad))
* **deploy:** update deployment workflows for bundled shared utilities ([f426a62](https://github.com/JCarran0/household-budgeting/commit/f426a62a4679955b944aec63a95a48415aa1278c))
* **reports:** resolve JavaScript Date parsing inconsistencies causing incorrect timeline displays ([0ed889d](https://github.com/JCarran0/household-budgeting/commit/0ed889dd75e989c8878bf5cfcd0942b14cdf89c3))
* **reports:** use standardized calculation methods for budget vs actual ([3cc9b31](https://github.com/JCarran0/household-budgeting/commit/3cc9b311e61bb1ce3e76935ed1481d8ed5ec8270))
* **terraform:** add Authorization header forwarding to nginx proxy config ([a489351](https://github.com/JCarran0/household-budgeting/commit/a48935123173cf781f0c139c1bb3057c8c4c7360))


### Code Refactoring

* consolidate budget calculation logic into shared utilities ([f566a76](https://github.com/JCarran0/household-budgeting/commit/f566a7613bae232adac795d4ea0050aceae63afb))

### [1.16.3](https://github.com/JCarran0/household-budgeting/compare/v1.16.2...v1.16.3) (2025-09-13)


### Bug Fixes

* **budgets:** exclude hidden categories from BudgetSummaryCards calculations ([500ae50](https://github.com/JCarran0/household-budgeting/commit/500ae505fcdacf5e8171ed3dada19873dd133cd3))

### [1.16.2](https://github.com/JCarran0/household-budgeting/compare/v1.16.1...v1.16.2) (2025-09-13)


### Bug Fixes

* **budgets:** revert child category exclusion in BudgetSummaryCards ([bd18eec](https://github.com/JCarran0/household-budgeting/commit/bd18eec969a899c78f774e0a2f56732e351409c4))

### [1.16.1](https://github.com/JCarran0/household-budgeting/compare/v1.16.0...v1.16.1) (2025-09-13)


### Bug Fixes

* **budgets:** prevent double-counting in BudgetSummaryCards calculations ([f539e57](https://github.com/JCarran0/household-budgeting/commit/f539e57a43bcc543f33f1b3fff4b25501356eb52))

## [1.16.0](https://github.com/JCarran0/household-budgeting/compare/v1.15.0...v1.16.0) (2025-09-13)


### Features

* **budgets:** add toggle to show/hide debug component ([b8a9067](https://github.com/JCarran0/household-budgeting/commit/b8a9067ae08b5fb6cab478c30898afbd59d21007))
* **feedback:** add user feedback submission via GitHub issues ([2661836](https://github.com/JCarran0/household-budgeting/commit/2661836ca7821b11289b79e765d19a141cc110f6))


### Bug Fixes

* **budgets:** correct spending widget calculation using hierarchical income detection ([8dc4b1a](https://github.com/JCarran0/household-budgeting/commit/8dc4b1a81fd953ffaf0dad56945c4a7ac8454d7a))
* **feedback:** resolve Jest ES module issues and improve UX ([d6f7325](https://github.com/JCarran0/household-budgeting/commit/d6f7325b77a9b1c5b86fdf8f5dd01b4bb58106d7))

## [1.15.0](https://github.com/JCarran0/household-budgeting/compare/v1.14.0...v1.15.0) (2025-09-13)


### Features

* **budgets:** add debug component for troubleshooting calculation issues ([343965b](https://github.com/JCarran0/household-budgeting/commit/343965bbed0adfcaee642018a07222e415f30c44))


### Bug Fixes

* **budgets:** remove animated striped progress bars in budget comparison ([c3c20f6](https://github.com/JCarran0/household-budgeting/commit/c3c20f6f7bec5d8b358dd7e8a8e59cdb54e5e2fc))

## [1.14.0](https://github.com/JCarran0/household-budgeting/compare/v1.13.0...v1.14.0) (2025-09-13)


### Features

* **budgets:** implement hierarchical display for budget setup tab ([40ac31c](https://github.com/JCarran0/household-budgeting/commit/40ac31ceb972d616ff04c86a06ca07018bd31631))
* **reports:** add budget vs actual dashboards to cash flow and spending trends tabs ([780b78d](https://github.com/JCarran0/household-budgeting/commit/780b78dd29df8ab1765355be34129622ea4dad31))
* **ui:** add clickable version number with changelog display ([57d17ed](https://github.com/JCarran0/household-budgeting/commit/57d17eddda1b582a8aa60862be111a8d92373ea2))


### Bug Fixes

* **budgets:** include parent category budgets in hierarchical totals ([2d1d5f3](https://github.com/JCarran0/household-budgeting/commit/2d1d5f3260ad49cf7819ee2eda9c4ab6acf952c9))
* **budgets:** prevent double-counting in spending widget totals ([2ca7887](https://github.com/JCarran0/household-budgeting/commit/2ca788749e418632b28136e36b8da7669c9997cc))
* **deploy:** include CHANGELOG.md in production deployment package ([b39c3c0](https://github.com/JCarran0/household-budgeting/commit/b39c3c0cf0040c6ead5298533d6e10c42346f22c))
* **filters:** enhance date parsing and storage to prevent timezone shifts ([0104622](https://github.com/JCarran0/household-budgeting/commit/0104622334c97761c50d7fc9afae206c5c930e8b))
* **reports:** align dashboard date ranges to start from January ([f362a1b](https://github.com/JCarran0/household-budgeting/commit/f362a1be0342f62deec69c02375115e802295e38))
* **transactions:** resolve custom date range picker functionality ([dbf51a4](https://github.com/JCarran0/household-budgeting/commit/dbf51a4ca10fddd3e4b2f67269e068542316bd16))


### Code Refactoring

* **reports:** replace any types with proper MonthlyBudget interface ([b3f5b99](https://github.com/JCarran0/household-budgeting/commit/b3f5b9934319c34654b31bf485858cb73c0f52e4))


### Chores

* **ui:** remove debug console logs from version fetching ([008b238](https://github.com/JCarran0/household-budgeting/commit/008b238c07393cdf93da25a024d3a2ebada75e5e))

## [1.13.0](https://github.com/JCarran0/household-budgeting/compare/v1.12.0...v1.13.0) (2025-09-09)


### Features

* **export:** enhance TSV exports with category type and properties metadata ([d27dd86](https://github.com/JCarran0/household-budgeting/commit/d27dd86cdbe357a3db97bf4a999bceac2119cf03))
* **reports:** add savings category breakdown reporting ([fe4464e](https://github.com/JCarran0/household-budgeting/commit/fe4464e88acd7a471b1f068cd41c0e1a550568d5))
* **reports:** enhance pie chart with dynamic 90% threshold and Other category drill-down ([4f6e61b](https://github.com/JCarran0/household-budgeting/commit/4f6e61bb0fd754564e50a0a97fabdfa02a9bb97c))


### Bug Fixes

* **reports:** correct income category filtering and improve chart tooltips ([d80be0e](https://github.com/JCarran0/household-budgeting/commit/d80be0e28a6e7a91ae29040252a26dc5197c207f))

## [1.12.0](https://github.com/JCarran0/household-budgeting/compare/v1.11.0...v1.12.0) (2025-09-08)


### Features

* **budgets:** enhance budget page with corrected calculations and improved UX ([c5ff754](https://github.com/JCarran0/household-budgeting/commit/c5ff75412d4e95fa4e7f71ea977e4b0e17a95efe))

## [1.11.0](https://github.com/JCarran0/household-budgeting/compare/v1.10.3...v1.11.0) (2025-09-08)


### Features

* **auth:** add secure password reset flow for single-user recovery ([716d728](https://github.com/JCarran0/household-budgeting/commit/716d7284a7a49682822e0c94c03697794e4f8917))
* **budgets:** add unified budget summary cards across all tabs ([6645aa9](https://github.com/JCarran0/household-budgeting/commit/6645aa962ee7ff0544be79e568442338ca30acec))
* **ui:** enhance reports and transactions with improved UX features ([023244e](https://github.com/JCarran0/household-budgeting/commit/023244e9cef8fd5177a95ff327629b4ccc42f68d))


### Bug Fixes

* **deploy:** improve shared utilities validation and health check ([5f0cc49](https://github.com/JCarran0/household-budgeting/commit/5f0cc49159e536d9d67b52cf9789d58e3fdfa8a4))


### Code Refactoring

* **frontend:** standardize money formatting across application ([52ef3e0](https://github.com/JCarran0/household-budgeting/commit/52ef3e0a9c455b8fbf1cdd7ab1a5c0fd31ab2087))

### [1.10.3](https://github.com/JCarran0/household-budgeting/compare/v1.10.2...v1.10.3) (2025-09-08)


### Bug Fixes

* **ci:** use always() to prevent deploy job from being skipped ([769bd06](https://github.com/JCarran0/household-budgeting/commit/769bd066377ff078b0c51525bcc79338efbdf717))

### [1.10.2](https://github.com/JCarran0/household-budgeting/compare/v1.10.1...v1.10.2) (2025-09-08)


### Bug Fixes

* **ci:** simplify deploy condition to handle all scenarios ([5234ba1](https://github.com/JCarran0/household-budgeting/commit/5234ba1faaa6ea14d670b9e85faee5b853a36375))

### [1.10.1](https://github.com/JCarran0/household-budgeting/compare/v1.10.0...v1.10.1) (2025-09-08)


### Bug Fixes

* **ci:** correct deploy job condition logic ([dcfa979](https://github.com/JCarran0/household-budgeting/commit/dcfa979f5706475a086e8b9286a11d0a4a84bcb4))

## [1.10.0](https://github.com/JCarran0/household-budgeting/compare/v1.9.0...v1.10.0) (2025-09-08)


### Features

* add transfer transaction filtering and shared calculation utilities ([be35ec5](https://github.com/JCarran0/household-budgeting/commit/be35ec56addeca003caf76098b020eba2ae42b0c))
* complete transfer filtering implementation across frontend and docs ([0c68b7f](https://github.com/JCarran0/household-budgeting/commit/0c68b7f7f7cdb248aa8c4b18cb7b96503d59a0d1))


### Bug Fixes

* **ci:** prevent deployment when tests fail and add comprehensive validation ([6030262](https://github.com/JCarran0/household-budgeting/commit/6030262b40e5a3503340c640c6b1a48f294a0db5))

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