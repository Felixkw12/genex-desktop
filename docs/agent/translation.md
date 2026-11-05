# Translating Genex

The app ships in English, Russian, Spanish, Brazilian Portuguese, German, French, Japanese, Korean
and Simplified Chinese (`Locale` in `src/shared/locale.ts`). Settings → Appearance → Language picks
one, System follows the computer: the first language in the person's own list (macOS Language &
Region, Windows' language order, Linux `LANGUAGE`/`LANG`) that Genex speaks, else English
(`matchLocale`, `computerLanguages` in `shared/locale.ts`). Any Portuguese reads Brazilian, any
Simplified Chinese reads `zh-Hans`, and Traditional Chinese (`zh-Hant`, TW, HK, MO) falls through to
the next language in the list. Main reads the computer's language list once and hands it to every
studio page it opens (`pageLanguageArguments`), so the window, Play's bar and the menus pick the same
language; a switch rebuilds the menu and reloads Play's bar. The in-app agents answer in the
language the person writes in, and Genex's own messages in the app's (`studio.language`,
`loop/language-prompts.ts`).

## Writing translatable code

- Every sentence a person reads goes through `t()` from `src/shared/i18n.ts`, written in English:
  `t("Publish your game")`. The English is the catalog key, so the code reads like the screen.
  This covers JSX text, `aria-label`, `title`, `placeholder`, `alt`, toasts, dialogs, menus,
  notifications and errors a person sees.
- The first argument is a plain string literal. Values go in ICU placeholders:
  `t("Played {days} days ago", { days })`. Never build a sentence from pieces (`"Stopped " + why`,
  `` `${count} ${noun}` ``): word order and grammar differ by language. Write each whole sentence.
- Counts use ICU plurals, never `count === 1 ?`:
  `t("{count, plural, one {# game} other {# games}}", { count })`. `=0` takes an exact case.
  `#` prints the count; `{n, number}` prints a number in the language's format.
- Choices use `select`: `t("{who, select, you {You} other {{who}}} played")`.
- A single `'` is an apostrophe; to show a literal `{`, write `'{'`.
- The same English needing different words in different places (a tab and a button both "Play")
  takes a context: `tc("tab", "Play")`. Use it only when the words really differ.
- Main-process and shared code that main runs calls `t()` where the words are used, never in a
  module-level constant: main sets its language after it starts and again when Settings changes
  it. The renderer loads the language before its modules (`renderer/main.tsx`), so its constants
  may call `t()`.
- Lists use `formatList(items)`; dates and numbers use `Intl` with `intlLocale()`.
- Not translated: identifiers, `data-*` values, storage keys, IPC and event names, log lines,
  model prompts (`*-prompts.ts`), regular expressions that read harness or tool output, and
  everything under `src/harness-seed/` and `src/game-template/`.
- Behavior never depends on displayed words: find elements by `data-*`, not by an `aria-label`.

After adding or changing messages, run `npm run i18n:extract`, then add each new key to every
catalog in `src/shared/locales/`. `npm run check:static` fails while `messages.ts` is stale, and
`tests/conformance/locales.test.ts` while a catalog misses a key, keeps a stale one, or changes a
placeholder. `npm run i18n:extract -- --context` writes each message with the code around its
uses to `.studio-dev/i18n/messages.json` for translating.

## Translating

Write as a friendly person talks to a 17-year-old who makes games: short, plain, no jargon,
informal address. Keep translations about as long as the English; buttons, tabs and menu items
must stay short. Read the code around each message to know where it shows. Keep placeholders,
`#`, `{n, plural, …}` structure and the names below exactly. Give every plural category your
language has (CLDR): Russian `one`, `few`, `many`, `other`; Japanese, Korean and Chinese `other`.

Never translated: Genex, Claude Code, Codex, OpenCode, OpenRouter, Opper, Grok, Grok Build, xAI, Cursor, Unity, Unreal, Godot, Roblox,
Blender, Meshy, Tripo, Uthana, Pro, Loop, Auto (the mode), Harness, Studio, model names, file
names, keys (⌘, Ctrl), URLs.

| English | Русский | Español | Português | Deutsch | Français | 日本語 | 한국어 | 简体中文 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| game | игра | juego | jogo | Spiel | jeu | ゲーム | 게임 | 游戏 |
| chat | чат | chat | chat | Chat | chat | チャット | 채팅 | 对话 |
| agent | агент | agente | agente | Agent | agent | エージェント | 에이전트 | 智能体 |
| main agent, the lead | главный агент | agente principal | agente principal | Hauptagent | agent principal | メインエージェント | 메인 에이전트 | 主智能体 |
| worker | помощник | ayudante | ajudante | Helfer | assistant | ワーカー | 작업자 | 助手 |
| reviewer | проверяющий | revisor | revisor | Prüfer | vérificateur | レビュアー | 리뷰어 | 审查员 |
| build (a run, noun) | сборка | build | build | Build | build | ビルド | 빌드 | 构建 |
| build (verb) | собирать | crear | criar | bauen | créer | つくる | 만들다 | 制作 |
| Keep building | Собирать дальше | Seguir creando | Continuar criando | Weiterbauen | Continuer | 続きをつくる | 계속 만들기 | 继续制作 |
| Live (tab) | Live | Live | Live | Live | Live | ライブ | 라이브 | 实时 |
| Builds (tab) | Сборки | Builds | Builds | Builds | Builds | ビルド | 빌드 | 构建 |
| assets | ассеты | recursos | recursos | Assets | ressources | アセット | 에셋 | 素材 |
| plugin | плагин | plugin | plugin | Plugin | plugin | プラグイン | 플러그인 | 插件 |
| publish | опубликовать | publicar | publicar | veröffentlichen | publier | 公開する | 게시하기 | 发布 |
| remix | ремикс | remix | remix | Remix | remix | リミックス | 리믹스 | 改编 |
| Play (section) | Играть | Jugar | Jogar | Spielen | Jouer | プレイ | 플레이 | 游玩 |
| Create (section) | Создать | Crear | Criar | Erstellen | Créer | つくる | 만들기 | 创作 |
| credits | кредиты | créditos | créditos | Credits | crédits | クレジット | 크레딧 | 积分 |
| friends | друзья | amigos | amigos | Freunde | amis | フレンド | 친구 | 好友 |
| account | аккаунт | cuenta | conta | Konto | compte | アカウント | 계정 | 账号 |
| sign in / sign out | войти / выйти | iniciar sesión / cerrar sesión | entrar / sair | anmelden / abmelden | se connecter / se déconnecter | サインイン / サインアウト | 로그인 / 로그아웃 | 登录 / 退出登录 |
| settings | настройки | ajustes | configurações | Einstellungen | réglages | 設定 | 설정 | 设置 |
| model / model provider | модель / провайдер моделей | modelo / proveedor de modelos | modelo / provedor de modelos | Modell / Modellanbieter | modèle / fournisseur de modèles | モデル / モデルプロバイダー | 모델 / 모델 제공자 | 模型 / 模型提供方 |
| local models | локальные модели | modelos locales | modelos locais | lokale Modelle | modèles locaux | ローカルモデル | 로컬 모델 | 本地模型 |
| effort | усилие | esfuerzo | esforço | Aufwand | effort | 思考量 | 노력 | 思考强度 |
| permissions | разрешения | permisos | permissões | Berechtigungen | autorisations | 権限 | 권한 | 权限 |
| Plan (mode) | План | Plan | Plano | Plan | Plan | プラン | 계획 | 计划 |
| save point | точка сохранения | punto de guardado | ponto de salvamento | Speicherpunkt | point de sauvegarde | セーブポイント | 저장 지점 | 存档点 |
| rewind / undo | откатить / отменить | retroceder / deshacer | voltar / desfazer | zurückspulen / rückgängig | revenir / annuler | 巻き戻す / 元に戻す | 되감기 / 실행 취소 | 回退 / 撤销 |
| cover / clip | обложка / клип | portada / clip | capa / clipe | Cover / Clip | couverture / clip | カバー / クリップ | 커버 / 클립 | 封面 / 片段 |
| library | библиотека | biblioteca | biblioteca | Bibliothek | bibliothèque | ライブラリ | 라이브러리 | 库 |
| storage / free up | место на диске / освободить | almacenamiento / liberar | armazenamento / liberar | Speicher / freigeben | stockage / libérer | ストレージ / 空ける | 저장 공간 / 확보 | 存储 / 释放 |
| computer control | управление компьютером | control del equipo | controle do computador | Computersteuerung | contrôle de l'ordinateur | コンピューター操作 | 컴퓨터 제어 | 电脑控制 |
| usage limit | лимит | límite de uso | limite de uso | Nutzungslimit | limite d'utilisation | 使用上限 | 사용 한도 | 使用额度 |
| multiplayer | мультиплеер | multijugador | multijogador | Mehrspieler | multijoueur | マルチプレイ | 멀티플레이 | 多人游戏 |
| game engine | движок | motor | motor | Engine | moteur | エンジン | 엔진 | 引擎 |
| plans (pricing) | тарифы | planes | planos | Tarife | forfaits | プラン | 요금제 | 套餐 |
| Try again | Попробовать снова | Reintentar | Tentar de novo | Erneut versuchen | Réessayer | もう一度試す | 다시 시도 | 重试 |
| Send a report | Отправить отчёт | Enviar un informe | Enviar relatório | Bericht senden | Envoyer un rapport | レポートを送信 | 보고서 보내기 | 发送报告 |

Per language:

- **Русский**: на «ты»; кнопки — инфинитив («Опубликовать»), статусы — что делает агент
  («Собирает уровень»); кавычки «», тире —, буква ё; «2 ч 30 мин».
- **Español**: tú, neutral for Spain and Latin America (no vosotros); buttons in the infinitive.
- **Português (Brasil)**: você; buttons in the infinitive.
- **Deutsch**: du; buttons in the infinitive; prefer short words over long compounds.
- **Français**: tu; buttons in the infinitive; a no-break space (U+00A0) before ? ! : ; and inside « ».
- **日本語**: です・ます, light and friendly; full-width 。、「」; half-width digits and Latin; no
  spaces between Japanese and Latin words.
- **한국어**: 해요체; buttons as nouns ("게시하기"); a space after Latin words as Korean spacing needs.
- **简体中文**: concise; full-width ，。：；a space between Chinese and Latin words or digits.
