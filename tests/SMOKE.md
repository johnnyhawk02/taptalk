# Smoke check

Run after a change to the app, before it goes to the iPad. Start it with
`python3 -m http.server 8642` and open http://localhost:8642.

1. `node --test` passes.
2. The board loads with no errors in the browser console.
3. Tap a word: it is spoken and added to the sentence bar. Tap the bar: the
   sentence is spoken. ⌫ and ✕ work.
4. Open a page from the left-hand column, choose a word: it goes back Home.
   On a place page (Places → School) the page stays open and Back goes up.
5. The core words strip shows on other pages, not Home.
6. Hold the page name for 1.5 s: editing starts. Tap a button: the editor
   opens. Change its word, Save, then Undo.
7. Drag a button to a new place while editing.
8. ⚙ Settings opens every tab. Change buttons per row and see the grid change.
9. 📄 Pages: switch page set, rename a page, copy a page, delete it, Undo.
10. Choose picture: search for "dog" and pick a symbol.
11. Settings → Backup: Save backup, then load it back.
12. Settings → Model words (or 🗣 Model words while editing): a tapped word is
    spoken and ringed in teal, but not added to the sentence bar. Folders still
    open pages. Stop modelling: taps go into the sentence again.
13. Reload with the network off (devtools → Offline): the app still opens.
