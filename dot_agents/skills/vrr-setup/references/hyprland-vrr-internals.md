# Hyprland VRR internals

Verified against **Hyprland v0.56.2**, commit `efb50993780079460b0cbed1363e2166a2de1d9f`.
Get the matching source with:

```bash
git clone --depth 1 --branch v0.56.2 https://github.com/hyprwm/Hyprland
# or fetch the exact commit your binary reports via `hyprctl version`
```

## Where VRR lives

| Concern | File |
|---|---|
| The `vrr` config keyword | `src/config/shared/monitor/Parser.cpp` (`parseVRR`) |
| Lua `vrr` binding | `src/config/lua/bindings/LuaBindingsConfigRules.cpp` |
| Enabling/disabling on the output | `src/config/shared/monitor/MonitorRuleManager.cpp` (`ensureVRR`) |
| Rule equality (the bug) | `src/config/shared/monitor/MonitorRule.cpp` (`compare`) |
| When rules get re-applied | `src/config/shared/monitor/MonitorRuleManager.cpp` (`ensureMonitorStatus`) |

## `parseVRR` semantics

```cpp
bool CMonitorRuleParser::parseVRR(const std::string& value) {
    if (!isNumber(value)) { m_error += "invalid vrr "; return false; }
    const auto VRR = std::stoi(value);
    m_rule.m_vrr = VRR < 0 ? std::nullopt : std::optional(VRR);
    return true;
}
```

Negative means "unset", which makes `ensureVRR` fall back to the global `misc:vrr` value.
The Lua binding clamps to `-1..3`.

## `ensureVRR` behaviour

Called from `Monitor.cpp` (after `applyMonitorRule`), from `PropRefresher.cpp` on
`REFRESH_MONITOR_STATES`, and from fullscreen handlers.

It early-returns when `!m->m_output || m->m_createdByUser`.

| `vrr` | Meaning |
|---|---|
| `0` | Off — commits `setAdaptiveSync(false)` if currently active |
| `1` | On for all windows, unless a window/layer rule sets `no_vrr` |
| `2` | On only while a window is fullscreen |
| `3` | On only while a fullscreen window reports content type `game` or `video` |

For `1`–`3` the critical sequence is:

```cpp
m->m_output->state->setAdaptiveSync(true);

if (!m_state.test()) {                       // DRM atomic test against the kernel
    Log::logger->log(Log::DEBUG, "Pending output {} does not accept VRR.", m->m_output->name);
    m->m_output->state->setAdaptiveSync(false);
}

if (!m_state.commit())
    Log::logger->log(Log::ERR, "Couldn't commit output {} in ensureVRR -> true", m->m_output->name);
```

`test()` is what makes `hyprctl monitors` meaningful: on rejection the code reverts
`adaptiveSync` to `false`, and that same field is what the CLI prints. A reported `vrr: true`
therefore implies the driver validated the state — it is not merely an echo of the config.

Note the failure logs are `Log::DEBUG`, so on a default install you will not see them even if
they fire. See gotcha 3 in `SKILL.md`.

## Why changing only `vrr` does nothing

`CMonitorRule::compare()` considers `m_resolution`, `m_refreshRate`, `m_scale`, `m_enable10bit`,
`m_drmMode`, `m_disabled` (hard); then colour management, position, transform, auto-dir,
reserved area, mirror (soft). **`m_vrr` appears in neither list.**

Then in `ensureMonitorStatus()`:

```cpp
auto cmp = rule.compare(m->m_activeMonitorRule);
if (!mustApplySoft && cmp == COMPARISON_FULL_MATCH)
    continue;                    // monitor skipped entirely
```

A rule that differs only in `vrr` compares as a full match. The monitor is skipped,
`m_activeMonitorRule` keeps the old `m_vrr`, `ensureVRR` never runs, and VRR state does not
change. No error is raised anywhere.

The same bug applies to any property absent from `compare()`. If a config value seems inert,
check that list before assuming the compositor ignored you.

## Rule storage and precedence

```cpp
void CMonitorRuleManager::add(CMonitorRule&& x) {
    std::erase_if(m_rules, [&x](const auto& e) { return e.m_name == x.m_name; });
    m_rules.emplace_back(std::move(x));
    scheduleReload();
}

for (auto const& r : m_rules | std::views::reverse) {
    if (PMONITOR->matchesStaticSelector(r.m_name))
        return applyWlrOutputConfig(r);
}
```

Two consequences:

- **Last matching rule wins** — rules are scanned in reverse insertion order.
- **Rules replace, not merge.** `get()` returns the matched rule wholesale, so an omitted
  field falls back to `CMonitorRule`'s default rather than the previous rule's value.

Defaults that make partial rules safe: `m_resolution = Vector2D()` means "preferred mode",
`m_scale = -1` means auto-scale, `m_offset = Vector2D(-INT32_MAX, -INT32_MAX)` means auto-position.

## Selectors

```cpp
bool CMonitor::matchesStaticSelector(std::string_view selector) const {
    if (selector.starts_with("desc:")) {
        return m_description.starts_with(trim(selector.substr(5)))
            || m_shortDescription.starts_with(trim(selector.substr(5)));
    }
    return m_name == selector;
}
```

Only two forms: exact connector name, or `desc:` prefix match. There is no serial selector.

## DRM plumbing

Relevant connector/CRTC properties: `VRR_CAPABLE` (connector) and `VRR_ENABLED` (CRTC).
These are readable only by the DRM master or `CAP_SYS_ADMIN`.

A healthy AMD connector logs this through aquamarine when the backend initialises:

```
drm: connector DP-6 crtc is capable of vrr: props.vrr_capable -> 138, crtc->props.vrr_enabled -> 25
```

`138` decodes as `ADAPTIVE_SYNC (1<<1) | DISCONNECT (1<<3) | 1<<7` — adaptive sync is present.
Compare against `eDP-*` on the same machine, which typically report `0` or `117` and log
`incapable of vrr`.