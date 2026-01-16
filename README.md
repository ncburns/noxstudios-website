# Nox Studios Website (Static)

This is a lightweight static website built from the provided Nox Studios brand kit assets.

## Local preview

Option A (Python):

```bash
cd nox_studios_website
python3 -m http.server 8080
```

Then open:

- http://localhost:8080

Option B (Node):

```bash
npx serve .
```

## Deploy

### GitHub Pages

1. Create a new repo (public or private).
2. Commit these files to the repo root.
3. In GitHub: Settings > Pages
4. Source: Deploy from a branch
5. Branch: main, folder: /root

### Netlify

- Drag and drop the folder into Netlify, or connect the repo.
- Build command: none
- Publish directory: / (repo root)

## Customization

- Update the email address in `index.html` (search for `data-mailto` and `mailto:`).
- Replace the Work section placeholders with real case studies.
- If you add analytics or a hosted form endpoint, update `privacy.html`.
