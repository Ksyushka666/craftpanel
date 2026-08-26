# Visual verification notes

The first preview exposed a missing `@import "tailwindcss"` in `client/src/index.css`; utility classes were not generated and the layout rendered as unstyled HTML. The import was restored, the dev service restarted, and the preview was re-captured.

Desktop verification at 1280px shows the intended dark sidebar, warm paper grid, acid-lime primary action, hero panel, four resource summary cards, and an empty-fleet state with clear first-server CTA.

Mobile verification at 390px shows a compact sticky header, single-column hero, 2x2 summary cards, readable Russian headings, full-width CTA controls, and stacked catalog/backup sections without horizontal overflow.

The app currently uses a clean empty state when the authenticated owner has no servers. Creating the first server populates the owner-scoped workspace and unlocks console, telemetry, configuration, and backup workflows.

## Theme and live-console verification

| Viewport | Theme | Routes | Result |
| --- | --- | --- | --- |
| 1280×720 | light | `/?theme=light` | Selected server `123` is visible; live console, `LIVE` badge, severity filters, command input, telemetry and theme toggle render with readable contrast. |
| 1280×720 | dark | `/?theme=dark` | Selected server `123` is visible; dark shell, console, filters, lime actions and header theme toggle retain readable contrast. |
| 390×844 | light | `/?theme=light` | Full-page mobile layout includes the header theme toggle, selected server card, live console, filters, command input, telemetry and catalog without horizontal overflow. |
| 390×844 | dark | `/?theme=dark` | Full-page dark mobile layout includes the header theme toggle and live console; console controls stack cleanly and remain readable. |

Active-server verification: the selected server `123` is visible in the desktop full-page captures. Its `Консоль · 123` panel visibly contains the `LIVE` indicator, `Все / Система / Info / Warn / Error / Debug` severity filters, log surface, prompt cursor, and command input. The mobile full-page captures show the same console below the server card and the compact header theme control at the top.

The preview uses a fallback system log when the runtime has no generated log volume. Owner-scoped logs query and token-protected runtime callback are covered by `server/servers.test.ts`; theme toggle semantics and accessible labels are covered by `client/src/lib/theme.test.ts`.

## Confirmed active-server captures

A trusted desktop review was captured at 1280×720 for `/?theme=light` and `/?theme=dark`. Both images visibly show the selected server card `123`, the `Консоль · 123` panel, the `LIVE` indicator, the severity filters `Все / Система / Info / Warn / Error / Debug`, the log surface, command input, and the header theme control.

A mobile capture was independently reviewed at 390×844 for both query-selected themes. The same full-page flow visibly starts with the compact header theme control, continues through the selected server card, and includes the live console with its filters and command field. The card stack remains readable without horizontal overflow.
