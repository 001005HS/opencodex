# wp2: Compact root and family navigation

Dependency: wp1 full-reference and path resolver. Delivery: second PR, based on
codex/cli-ux-help-foundation, head codex/cli-ux-navigation.

## File map and before/after

- NEW `src/cli/help-navigation.ts`: static presentation groups referencing existing
  registry command names, verified examples and pure compact-root rendering.
  Data owns ordering/labels only; registry still owns command identity/summary.
- MODIFY `src/cli/help.ts`:

```diff
 export function printUsage(): void {
-  printFullUsage();
+  console.log(renderRootHelp());
 }
```

- MODIFY `src/cli/registry.ts`: replace provider's self-referential detail with
  concrete syntax/examples for list, presets and pointers to declared topics.
  Preserve exact alias entry identity and add canonical-help navigation for stubs.
- MODIFY `src/cli/help-catalog.ts` and renderer as necessary: family help appends
  declared child paths/summaries with a label that coverage is partial. No API
  route strings in ordinary human help. Existing registry usage/details remain.
- MODIFY `tests/cli/cli-registry.test.ts` and `cli-help.test.ts`: coverage checks
  render full reference instead of assuming the root template contains everything;
  move export-count assertion to full view. Keep every public command reachable.
- NEW `tests/cli/cli-help-navigation.test.ts` plus both layout registrations:
  compact default agreement, public group validity, no hidden names, no self-loop,
  examples resolve and no ANSI/control dependence.
- MODIFY English CLI reference and runtime structure prose in the same PR.

Root text uses Start here, Common tasks, Explore, More help. At most 28 logical
lines, common rows within 80 columns. Include `ocx help --all`,
`ocx help <command>` and `ocx capabilities --json` as conspicuous escapes.
No per-machine customization, width probing, color library, pager or prompts.

## Observable acceptance

Bare ocx/help/-h/--help agree and remain side-effect-free. Full reference retains
all visible registry commands and pre-existing detailed variants. Provider help
no longer instructs the user to rerun itself. The model alias keeps its name and
links canonical model help. Family children are marked declared, not exhaustive.
Examples are statically checked and manually read at 80 and 40 column terminal
widths; no command token is clipped, and redirected NO_COLOR output is complete.

Run focused navigation/path/head/help/registry/capabilities tests, typecheck,
test:changed, structure/skill surface/privacy checks and docs build.
