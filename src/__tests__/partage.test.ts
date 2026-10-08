import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOSSIER = join(__dirname, '..', 'partage');
const fichiers = readdirSync(DOSSIER).filter((f) => /\.tsx?$/.test(f));

/**
 * `src/partage/` est le code commun au client mobile et au client Web : il doit rester copiable tel quel.
 * Il n'importe donc que `react` et ses propres fichiers (chemins relatifs) : ni React Native, ni Expo,
 * ni alias `@/` de l'application.
 */
describe('src/partage : code réutilisable par le mobile et le Web', () => {
  it('contient bien les fichiers communs', () => {
    expect(fichiers.sort()).toEqual(['groupResults.ts', 'highlight.ts', 'search.ts', 'useAsyncResource.ts', 'useSearch.ts']);
  });

  it.each(fichiers)("%s n'importe que react ou un fichier voisin", (fichier) => {
    const source = readFileSync(join(DOSSIER, fichier), 'utf8');
    const imports = [...source.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const cible of imports) {
      expect(cible === 'react' || /^\.\/[A-Za-z]+$/.test(cible)).toBe(true);
    }
  });
});
