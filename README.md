# SkyDrone-Weather

Site publicado automaticamente pelo GitHub Pages:

https://jp4k.github.io/SkyDrone-Weather/

## Deploy automatico

Este repositorio usa GitHub Actions para publicar o site sempre que houver push na branch `main`.

Fluxo:

1. Voce altera qualquer arquivo do projeto.
2. Faz commit e push para `main`.
3. O workflow `.github/workflows/deploy.yml` roda automaticamente.
4. O GitHub Pages publica a nova versao do site.

Nao e necessario fazer deploy manual.

## Como atualizar o site

```bash
git add .
git commit -m "Atualiza site"
git push origin main
```

Depois do push, acompanhe a execucao em `Actions > Deploy GitHub Pages`.

## Como o workflow funciona

O deploy detecta o tipo do projeto automaticamente:

- HTML/CSS/JS puro: publica os arquivos da raiz do projeto.
- Vite/React com script `build`: instala dependencias, roda `npm run build` e publica `dist/`.

O workflow tambem:

- usa as Actions oficiais do GitHub Pages;
- aplica cache de dependencias npm quando existe `package-lock.json`;
- bloqueia o deploy se `index.html` nao existir no artefato final;
- bloqueia o deploy se um build configurado falhar;
- gera arquivos comprimidos `.gz` para assets estaticos;
- adiciona `.nojekyll` para evitar processamento indesejado pelo Pages.

## Branch de publicacao

O deploy automatico roda em:

```text
main
```

Qualquer push para essa branch atualiza o site publicado em GitHub Pages.
