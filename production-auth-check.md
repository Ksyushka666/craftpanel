# Production OAuth verification

- URL: https://craftpanel-7d9t.onrender.com/
- GitHub Actions Render workflow: run 33105720165, conclusion success, head SHA fcebb7d1.
- Browser title after deploy: CraftPanel — Minecraft hosting control.
- The browser navigation completed, but screenshot upload failed and no interactive elements were returned; browser_view saved HTML at /home/ubuntu/browser_html/craftpanel-7d9t_onrender_com_page_1787856996164.html.
- Previous production bundle before the successful workflow contained the old /app-auth + camelCase contract. A fresh bundle fetch timed out after 72,376 bytes during Render restart/cold start, so the new bundle contract still needs a direct post-deploy fetch once the service is warm.
- Callback probe without nonce returned expected HTTP 403, not a server crash.

## Post-deploy Render confirmation

Render dashboard now reports commit fcebb7d1 as **Live** at https://craftpanel-7d9t.onrender.com, deploy id dep-da88fkifngtc73bn2ue0, deployed August 27, 2026 at 18:54:10 UTC. The GitHub Actions run 33105720165 completed successfully. Render notes that the Free instance may take 50 seconds or more to wake after inactivity.

## Browser end-to-end limitation

After the Render dashboard reported the fcebb7d1 deploy Live, a production browser navigation was attempted. The browser did not return interactive elements or a screenshot; the subsequent wait landed on about:blank. Therefore the authenticated account-selection step could not be completed in the sandbox browser. The production deployment itself is confirmed Live in Render, and the OAuth contract is covered by the local regression test.
