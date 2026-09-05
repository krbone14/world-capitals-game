# Passation — Les Capitales du Monde

État au 4 septembre 2026. Branche `main`, 25 commits, `de7d190`, arbre propre.

---

## 1. L'objectif

Publier **Les Capitales du Monde** sur le Google Play Store. Le jeu existait déjà
comme site statique bilingue (français / anglais) déployé sur GitHub Pages ; il
s'agissait de l'emballer en application Android et de le faire passer par tout le
circuit du Play Console.

Objectif secondaire, différé : publier ensuite sur **itch.io**, qui héberge
directement les jeux HTML5, puis éventuellement le **Microsoft Store**. Steam a
été étudié et écarté — techniquement faisable via Tauri, mais 100 $ par jeu et
surtout le mauvais public pour un jeu éducatif pour enfants.

## 2. La problématique

Trois problèmes distincts, dans l'ordre où ils se sont posés.

**Empaqueter sans dupliquer le code.** Le choix s'est porté sur **Capacitor**
plutôt qu'une *Trusted Web Activity*. Une TWA pointe vers un site hébergé et
prouve la propriété du domaine via un `assetlinks.json` servi à la **racine** —
or le jeu vit sur `krbone14.github.io/world-capitals-game/`, un sous-chemin, donc
ce fichier ne pouvait pas être servi depuis ce dépôt. Capacitor copie le site
dans le paquet et supprime le problème. Contrepartie assumée : une correction de
contenu demande désormais une release Play, là où une TWA se serait contentée
d'un `git push`.

**Devenir autonome.** Capacitor sert l'application depuis une origine locale où
aucun service worker ne tourne. Les drapeaux venaient de `flagcdn.com` et étaient
mis en cache par le service worker : le mode drapeaux aurait exigé le réseau sur
un jeu dont l'intérêt est de s'en passer. Ils sont désormais téléchargés au build
et commités. Dans la foulée, deux autres origines externes ont sauté. L'app n'a
plus **aucune permission réseau**, ce qui rend la déclaration « Sécurité des
données » irréfutable plutôt que simplement vraie.

**Franchir la porte du test fermé.** Un compte développeur personnel créé après
novembre 2023 ne peut pas publier en production sans un test fermé de
**12 testeurs inscrits 14 jours consécutifs**. C'est le vrai facteur de délai du
projet, pas la technique.

## 3. Les fichiers importants

| Fichier | Rôle |
|---|---|
| `index.html` | tout le jeu : gabarit et logique. C'est le seul fichier de code du jeu |
| `tools/country-config.mjs` | le roster : pays, régions, continents, couleurs, emojis |
| `tools/build-flags.mjs` | télécharge les 195 drapeaux dans `assets/flags/` |
| `tools/build-dist.mjs` | assemble `dist/` : liste blanche de ce qui part dans l'APK |
| `tools/build-icon.mjs` | dessine l'icône depuis `assets/geo/world.js` |
| `tools/build-android-icons.mjs` | les 26 images Android, fond échantillonné de l'icône |
| `tools/build-store-assets.mjs` | captures et bandeaux Play, dans les deux langues |
| `tests/smoke.mjs` | le test de bout en bout, dans un vrai Chromium |
| `android/app/build.gradle` | signature et `versionCode` dérivé du nombre de commits |
| `android/app/src/main/AndroidManifest.xml` | pas de permission `INTERNET`, délibérément |
| `privacy.html` | politique de confidentialité, exigée par Play |

**Hors dépôt, indispensable :** la clé de signature à
`C:/AI/android-keystore/world-capitals.jks`, référencée par
`android/keystore.properties` (ignoré par git). **Sa perte est irréparable** :
Play n'accepte les mises à jour que depuis la clé qui a publié l'app. À
sauvegarder ailleurs si ce n'est pas déjà fait.

Chaîne de compilation : JDK 21 dans `C:\AI\android-toolchain`, SDK Android dans
`%LOCALAPPDATA%\Android\Sdk`. Le JDK 25 du système ne convient pas — Gradle le
refuse, et ce n'est qu'un JRE.

## 4. Ce qui a été essayé et qui a raté

**Le rétrécissement des étiquettes au zoom.** Livré, puis annulé. Le raisonnement
était inversé : une étiquette à taille d'écran constante couvre une part
**décroissante** de la carte à mesure qu'on zoome — 60 px contre une carte huit
fois plus large, c'est un huitième du terrain qu'elle occupait à ×1. Rétrécir ne
corrigeait rien et rendait le texte illisible (7 px). Le test passait au vert : il
vérifiait fidèlement une intention fausse. C'est un essai sur téléphone qui l'a
attrapé. L'invariant correct est maintenant verrouillé par une assertion à ×1,
×2, ×4 et ×8.

**Le sélecteur `[style*="transition:opacity"]` dans le test.** React normalise
les styles en ligne, donc la chaîne écrite par l'auteur n'est jamais celle
présente dans le DOM. Remplacé par une recherche sur le style calculé.

**Le mode sombre.** Non anticipé. Android inversait les couleurs du jeu tout
seul, et cette inversion effaçait les frontières entre pays sélectionnés — deux
symptômes signalés séparément, une seule cause. Corrigé par
`<meta name="color-scheme" content="only light">`.

**Le bandeau bilingue.** Le titre dans une langue et sa traduction en
sous-titre : l'intention était de dire « le jeu est bilingue », le résultat se
lisait comme une faute. Chaque bandeau ne parle plus qu'une langue.

**Deux pistes d'icône mortes.** Le globe logé dans la tête du pin et les trois
petits pins sur la carte : illisibles en dessous de 96 px. Le test qui compte
pour une icône de lanceur est de la regarder à 48 px, masquée en rond — pas à
512 px.

**Les premières captures du store.** Prises sur une région de 7 pays, ce qui
laissait le bac d'étiquettes presque vide et un grand blanc en bas. Refaites sur
des régions plus fournies.

**Deux erreurs de procédure Play**, notées pour mémoire : le nom du package est
demandé à la création de l'app, il n'est pas déduit du bundle ; et le lien
d'inscription des testeurs n'apparaît qu'**après** l'examen de la première
version, pas avant.

**Le cache HTTP.** Plusieurs allers-retours perdus parce que le téléphone
testait une version périmée servie par `npx serve`, qui n'envoie pas de
`Cache-Control`. Ajouter `?v=n` à l'URL lors des essais.

## 5. La prochaine étape

**Immédiat — combler la marge.** La version 25 est en ligne sur le canal de
test fermé depuis le 4 septembre 09:44. La console affichait le jour même, dans
`Tester et publier → Production` : « 12 testeurs sont actuellement inscrits pour
1 jour ». Le groupe Google, lui, compte 14 membres.

**Ce que ce 12 signifie n'est pas établi.** Soit c'est le nombre réel d'opt-in,
et deux membres du groupe n'ont jamais ouvert le lien d'inscription — la marge
est alors nulle. Soit l'affichage est plafonné au seuil exigé, et il resterait à
12 même à 16 testeurs. Ni la documentation Google ni les guides consultés ne
décrivent cette ligne. Le seul indice : le « 1 jour » ne peut venir que des
données du compte, puisque l'exigence est de 14 jours, donc la phrase rapporte
un état et non la règle — ce qui rend le plafonnement peu probable sans
l'exclure.

**Le test qui tranche :** faire activer le test aux deux membres non inscrits.
Si la ligne passe à 13 ou 14, le nombre est réel. Si elle reste à 12 alors que
les 14 ont confirmé avoir installé, il est plafonné et la seule vérité devient
leur confirmation directe. Dans les deux cas ces opt-in sont à obtenir : être
membre du groupe ne compte pas, et ajouter des testeurs ne remet aucun compteur
à zéro. À 12 pile, une désinscription fait tomber la condition et repart pour
14 jours.

Le chiffre se lit dans `Tester et publier → Production`, bloc *Demander un accès
en production* : la console y donne le nombre d'inscrits et depuis combien de
jours. Nulle part elle ne dit **qui** — avec un groupe, la liste nominative n'est
que dans `groups.google.com → Membres`, et l'onglet *Statistiques* ne sert à
rien ici (agrégation quotidienne différée, et effectifs trop faibles pour être
affichés dès qu'on ventile).

**Vers le 17 septembre — demander l'accès à la production.** `Tester et publier
→ Production`, bouton *Demander à publier en production*, grisé tant que les
14 jours ne sont pas faits — le décompte a démarré le 4 septembre (« pour
1 jour » ce jour-là). Ce n'est pas une case à cocher mais une rédaction : Google
demande comment les testeurs ont été recrutés, quels retours ont été recueillis
et ce qui en a été fait. *Prévisualiser les questions* les montre à l'avance.
L'argument est déjà constitué — quatre retours, quatre corrections livrées le
4 septembre.

**Cinq chantiers convenus pour la prochaine mise à jour :**

1. **L'emoji de l'Afrique.** C'est `🌍`, qui ne dit rien de l'Afrique et fait
   doublon avec le `🌐` du Monde. **Stéphane a tranché le 4 septembre : `🦁`**,
   contre le `🦓` qui était recommandé et le `🥁` proposé en alternative. Le
   zèbre l'était pour son noir et blanc, qui tranche sur le terracotta `#DD7A57`
   de la carte là où un lion est fauve sur fauve : à regarder sur le téléphone à
   la taille d'une carte, et à lui montrer si ça passe mal — pas à remplacer de
   son propre chef. Une ligne dans `tools/country-config.mjs`, puis `npm run data`.
2. **Le fondu pendant le panoramique.** Les étiquettes ne s'estompent pas quand
   on déplace la carte. Le panoramique écrit la transformation directement dans
   le DOM sans rendu React, délibérément, donc aucune liaison d'opacité ne se met
   à jour. Correctif sans perdre la fluidité : une classe CSS posée sur le
   conteneur au début du geste, l'opacité pilotée par la feuille de style.
3. **Les étiquettes qui se masquent entre elles à faible zoom.** Kinshasa et
   Brazzaville sont le pire cas possible — 5 km d'écart. Aucun réglage d'opacité
   ou de taille ne les séparera : il faut replier les étiquettes anciennes sur
   leur seule pastille, ou une vraie passe de détection de collisions.

4. **Les remerciements aux testeurs, par leur prénom.** Ils ont porté le test
   fermé et quatre d'entre eux ont fait remonter les défauts corrigés le
   4 septembre ; la version publique devrait le dire. **Deux points à régler
   avant d'écrire quoi que ce soit :**
   - **Les prénoms.** Ils ne sont écrits nulle part dans le dépôt. À demander à
     Stéphane, qui seul a la liste dans la Play Console. Prénoms seuls, jamais
     les adresses e-mail des comptes de test.
   - **Où les mettre.** Deux endroits possibles, de coût très différent. La
     **fiche Play** se modifie dans la console sans release ni code, et la
     description est déjà bilingue — c'est le chemin court. Un **écran de
     crédits dans le jeu** n'existe pas : il n'y a aujourd'hui aucune surface
     « à propos », donc il faudrait la créer, la traduire dans les deux langues
     et la couvrir dans `tests/smoke.mjs`. Choix non tranché.

   Leur demander leur accord avant publication : un prénom reste une donnée
   personnelle, et l'app se vante à juste titre de n'en collecter aucune.

5. **Bug — l'anecdote qu'on ne peut pas fermer sur « Tout le continent ».**
   Signalé le 5 septembre. Au-dessus de `FACT_MODAL_MAX = 20` pays,
   `longLevel()` est vrai et l'anecdote n'est plus la fenêtre modale avec son
   bouton *Continuer* mais une carte posée en bas de la carte du monde
   (`index.html`, gabarit ligne 708, affectation ligne 1633). Cette carte n'a
   aucun bouton de fermeture, elle est en `pointer-events:none`, et elle reste
   jusqu'au placement correct suivant — donc indéfiniment après le dernier. Elle
   masque le bas du continent, là où il reste des pays à poser.

   **Décision de Stéphane : supprimer les anecdotes sur ces niveaux**, qui sont
   un examen final où elles n'apportent rien. Deux conséquences à vérifier avant
   de coder :
   - La carte latérale **n'existe que** sur les niveaux longs : la retirer là ne
     laisse rien derrière, ça supprime la fonctionnalité entière plutôt que
     d'ajouter une condition. Les anecdotes redeviennent la modale seule, à 20
     pays ou moins.
   - Le seuil est un **nombre de pays**, pas le mode « tout le continent » : la
     règle attrape aussi Le Monde et tout continent entier. Confirmer que c'est
     bien voulu, sinon il faut un critère distinct.

   `tests/smoke.mjs` affirme aujourd'hui le contraire — que l'Europe entière et
   le monde entier montrent l'anecdote à côté de la carte. Ces assertions sont à
   retourner, pas à supprimer : elles restent la mémoire de la règle.

   À noter, le contournement existe déjà pour un joueur : le bouton 📖 de la
   barre du haut coupe les anecdotes et le choix est retenu d'une partie à
   l'autre.

**Après la production :** itch.io, où `dist/` se téléverse tel quel.

---

### La boucle de travail

```bash
npm run dist
npx cap sync android
android/gradlew -p android bundleRelease
```

`JAVA_HOME` doit pointer sur le JDK 21 — il pointe sur un JRE 25 par défaut sur
cette machine, et Gradle échoue alors avec un message obscur. Le `versionCode`
s'incrémente seul avec les commits ; `-PversionCode=<n>` le force si besoin.

Toute modification passe par une branche, une PR, une CI verte et un essai sur
téléphone avant fusion. La fusion sur `main` déclenche le déploiement GitHub
Pages : elle change le site public immédiatement.
