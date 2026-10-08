# Validacao de login e chat mobile

## Resultados em 2026-10-07

Login real por credenciais e /me em tres contas temporarias: aprovado. Chat do evento e privado: envio, notificacao Socket.IO para a outra conta, consulta de historico e deduplicacao aprovados. Terceiros recebem HTTP403. Indicador digitando, reconexao com recuperacao de historico e revogacao de inscricao bloqueando leitura/envio aprovados. Dados de teste removidos; contas existentes preservadas. Estes testes exercitam a API e Socket.IO reais, nao substituem validacao visual em aparelho.

## Google

O hook nativo usa GoogleSignin e envia o idToken para /v1/auth/google; o servidor verifica a audiencia do client ID web. Expo Go nao inclui o modulo. Instale a build propria. Android necessita cliente OAuth com package com.eventmap.mobile e SHA-1 correspondente ao certificado que assina a build. iOS necessita cliente proprio, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID e build iOS assinada; o plugin deriva o URL scheme desse client ID. Nunca invente ou reutilize o client ID Android no iOS.

## Executar

Terminal 1: `npm run backend`. Terminal 2: `npm run start:dev`. Android conectado com depuracao USB ou emulador: `npm run android` instala/abre a build. Para instalar APK manualmente: android/app/build/outputs/apk/debug/app-debug.apk; depois abra a build EventMap, nao Expo Go. No iPhone, Android APK nao serve; a build iOS exige macOS/Xcode ou EAS com credenciais Apple apropriadas. OAuth real so fica validado depois de escolher a conta no aparelho.

Fontes: https://react-native-google-signin.github.io/docs/setting-up/expo e https://docs.expo.dev/develop/development-builds/introduction/
