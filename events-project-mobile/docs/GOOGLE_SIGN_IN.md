# Login Google nativo

## Estrutura preservada
Expo SDK 57.0.27; Google Sign-In 16.1.5 já instalado (peer Expo >=52.0.40).
Botão existente -> hook nativo -> Google SDK -> ID token -> POST /v1/auth/google -> sessão existente -> SecureStore.
A API valida assinatura, audience, issuer, expiração e email verificado. A identidade é o sub do Google.
Contas Google já vinculadas são reutilizadas. Um email igual ao de uma conta apenas de senha NÃO autoriza vínculo automático: a API retorna conflito para proteger essa conta.
Nenhuma migração é necessária e o site permanece intacto.

## Variáveis
No .env do app:
- EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: ID do cliente OAuth tipo Aplicativo da Web (audience do ID token).
- EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: cliente OAuth iOS; obrigatório para Google em iPhone.
- EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: identificação administrativa do cliente Android existente; o SDK Android identifica app pelo package + certificado, e usa o WEB client para ID token.
- EXPO_PUBLIC_API_URL: origem da API mobile acessível pelo aparelho, atualmente porta 4100. Não usar localhost no celular.

No server/.env:
- GOOGLE_NATIVE_CLIENT_IDS: lista de audiences permitidas; deve incluir exatamente EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
- DATABASE_URL e MOBILE_AUTH_SECRET: manter os valores privados existentes; nunca colocar no ambiente público do app.

## Google Cloud Console
1. Abra o projeto Google que contém o cliente Web configurado. Em Google Auth Platform / Clients, confira o cliente Android:
   - package: com.eventmap.mobile
   - SHA-1 desta build debug: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
2. Confira o cliente Web e copie seu Client ID para o app e para a lista de audiences da API. Não copie o Client Secret para o app.
3. Em Audience, se a aplicação estiver em Testing, adicione as contas de teste. Verifique nome/email de suporte na tela de consentimento.
4. Para iOS, crie um cliente iOS com bundle ID com.eventmap.mobile e defina EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. O app.config deriva automaticamente o URL scheme reverso do ID iOS.
5. Certificados EAS e Play App Signing diferentes precisam de seus próprios clientes Android/SHA-1. O certificado acima vale só para esta build debug.

Não há callback HTTP de túnel neste fluxo nativo; trocar a URL Cloudflare não muda o OAuth Android/iOS. A URL da API, porém, deve continuar acessível.
Este projeto usa Google Cloud diretamente, sem Firebase: google-services.json e GoogleService-Info.plist não são necessários. No Android, o SDK é autolinkado. Com cliente iOS, o plugin oficial recebe iosUrlScheme e usa a configuração sem Firebase.
Sem cliente iOS, o login informa que não está configurado; não usamos URL scheme fictício nem a variante Firebase do plugin.

## Executar
Na pasta C:\Users\gabri\EventsApp\events-project-mobile, em terminais separados:

```powershell
npm run api:dev
npm run android
# Após instalar a development build, nas próximas execuções:
npx expo start --dev-client --lan
```

No iPhone, é necessária uma development build iOS instalada, feita em macOS com npx expo run:ios ou via EAS com provisionamento Apple. Expo Go não suporta este módulo. A prévia web também não executa o SDK nativo; login por senha continua disponível nela.

## Validação
Automatizados: fluxo do hook, sucesso/cancelamento, bloqueio de duplo clique, falta de token, erros de rede/Play Services/configuração, logout nativo, conta nova/já vinculada, recusas de token com audience/issuer/expiração inválidos.
Os testes usam mocks; não substituem uma autenticação real com Google em aparelho.

Checklist manual na development build:
- Entrar com uma conta Google já vinculada e conferir a conta correta.
- Entrar com uma conta Google nova e conferir que apenas uma conta é criada.
- Cancelar o seletor e continuar deslogado, sem erro.
- Testar rede desligada durante o login e tentar de novo após reconectar.
- Tocar repetidamente no botão e conferir que existe apenas um login em andamento.
- Sair, verificar bloqueio de rotas privadas, entrar novamente e trocar de conta.
- Reiniciar o app e conferir restauração da mesma sessão.
- Conferir em Android físico e iPhone com seus respectivos certificados/clientes.

Referências: https://docs.expo.dev/guides/google-authentication/ e https://react-native-google-signin.github.io/docs/setting-up/expo

## Resultado desta execução
- TypeScript do app e da API: sem erros.
- Lint dos arquivos alterados e do app: sem erros/avisos.
- 15 testes do fluxo Google nativo, 74 da API e 18 do cliente: passaram.
- Development build Android x86_64 (emulador): BUILD SUCCESSFUL; APK em android/app/build/outputs/apk/debug/app-debug.apk. Para aparelho físico, npm run android recompila para a arquitetura selecionada.
- Nenhum aparelho conectado no adb. Não foi executada escolha real de conta Google nem login em dispositivo.
- Não foi compilado iOS: falta cliente OAuth iOS e ambiente macOS/EAS com provisionamento Apple.
