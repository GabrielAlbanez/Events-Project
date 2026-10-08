# Android local

Projeto: C:\Users\gabri\EventsApp\events-project-mobile.

## Ambiente usado
- Expo SDK 57, React Native 0.86.3.
- Android SDK Platform 36, NDK 27.1.12297006.
- Java 21 do Android Studio (jbr), selecionado apenas no processo.
- Emulador Medium_Phone_API_36, com aceleração AEHD.

## Executar
1. Inicie a API independente com `npm run api:dev` (porta 4100). Aplique antes a migração com `npm run api:migrate`.
2. Abra o emulador pelo Device Manager do Android Studio.
3. Execute `powershell -ExecutionPolicy Bypass -File scripts/android-dev.ps1` na pasta mobile.

O script usa Metro na porta 8082 e API/Socket.IO em http://10.0.2.2:4100, que representa o computador dentro do emulador Android. Não substitua o endereço da API do celular físico por esse IP. Em dispositivo físico use o IP LAN do computador no `.env` do Expo.

Abra a pasta android gerada no Android Studio. Se houver confirmação de confiança, revise-a manualmente; não é necessário adicionar exclusões ao Microsoft Defender. A versão instalada Meerkat é antiga: caso o IDE rejeite o Android Gradle Plugin, atualize o Android Studio conforme a compatibilidade oficial, sem reduzir a versão do Expo.

## Integrações pendentes
- Mapa nativo: configurar GOOGLE_MAPS_ANDROID_API_KEY com autorização para o pacote com.eventmap.mobile e certificado correto, e reconstruir. Sem essa configuração há um aviso e a lista de eventos continua disponível.
- Google nativo: configurar os client IDs Android/web exigidos pelo fluxo mobile e os audiences aceitos pela API. O callback web do túnel não substitui a configuração OAuth nativa.
- Câmera, upload, login entre duas contas e chat precisam de validação no dispositivo com permissões/contas reais.

Não regenere android com prebuild durante uma compilação ou enquanto ferramentas estiverem bloqueando seus arquivos. android é gerado pelo Expo; configure alterações nativas em app.config.ts.

## VS Code
Abra EventMap-mobile.code-workspace. Em Terminal > Run Task, selecione Mobile: Android (emulador), Mobile: API, TypeScript, Lint ou Testes. API e Metro já iniciados não devem ser duplicados na mesma porta. Android Studio e VS Code podem ficar abertos juntos; ambos usam a mesma pasta e o mesmo emulador. Nenhuma extensão adicional é obrigatória.


Documentação oficial: https://docs.expo.dev/workflow/android-studio-emulator/ e https://developer.android.com/studio/releases (compatibilidade do IDE com AGP).


## Caminhos C++ no Windows
plugins/withAndroidObjectPaths.cjs acrescenta o argumento oficial CMAKE_OBJECT_PATH_MAX=240 ao CMake durante o prebuild, para que nomes longos de objetos usem hashing. Referências: https://cmake.org/cmake/help/latest/variable/CMAKE_OBJECT_PATH_MAX.html e https://developer.android.com/studio/projects/gradle-external-native-builds. O plugin é idempotente e falha explicitamente se o template Gradle mudar.


No Windows, o script reserva temporariamente X: para esta mesma pasta e usa X:\.cxx como cache C++ (EVENTMAP_NATIVE_CXX_DIR). Não move arquivos. Se X: estiver ocupado por outro projeto, falha com instrução clara. Feche ferramentas de build antes de remover esse alias com subst X: /D. O diretório .cxx é gerado e ignorado pelo Git. Apenas o argumento de comprimento não bastou neste caminho original; o cache curto resolve a parte longa do diretório do Ninja.


## Metro no emulador
Antes do script Android, inicie a tarefa Mobile: Metro (Android) no VS Code. Ela usa localhost IPv4 na porta 8082; o script compila/instala sem iniciar outro Metro. Isso evita conexão somente IPv6, inacessível por 10.0.2.2. Mantenha API e Metro abertos em terminais separados.

Validação realizada em etapas anteriores: APK Android compilado e instalado; home carregou cinco eventos reais no emulador. Isso não valida a API independente, seu banco migrado, login Google ou fluxos autenticados atuais.


Exportação final Android/iOS/web também passou após a atualização do SDK. Navegação agenda/detalhe/retorno e tela de login foram inspecionadas no emulador; login não foi submetido.


## Google e Maps Android configurados
Cliente OAuth de desenvolvimento cadastrado para com.eventmap.mobile e SHA-1 do debug keystore atual. Chave Maps separada restrita ao mesmo pacote/certificado e exclusivamente Maps SDK for Android; valor somente no .env local. O servidor aceita o audience web do mesmo projeto e valida o ID token Google. O login nativo usa @react-native-google-signin/google-signin, sem callback do túnel. Para distribuição/release, cadastrar o SHA-1 de assinatura correspondente; iOS exige cliente próprio compatível com bundleIdentifier. Não reutilizar client secrets no app.


Validação em 06/10/2026: APK debug compilado e instalado com dados preservados (-k); após reiniciar emulador e limpar cache Metro, mapa renderizou Campinas e marcadores reais. TypeScript/lint, 11 testes cliente, 10 testes servidor e Expo Doctor 21/21 aprovados. Login Google precisa de seleção/login manual da conta no emulador para validação ponta a ponta. Nenhuma alteração no login do site nem na cobrança Google Cloud.


## Falha Prefab/CMake com Java 24

`npm run android` agora chama `scripts/run-android.cjs`. No Windows, o launcher seleciona JDK 17/21, preferindo o JBR do Android Studio; `EVENTMAP_JAVA_HOME` permite indicar outra instalacao compativel. A escolha vale apenas para o processo filho, sem mudar configuracoes globais do computador. Argumentos do Expo continuam funcionando, por exemplo `npm run android -- --port 8082`.

Diagnostico: JAVA_HOME apontava para JDK 24. O processo Prefab emitia `WARNING: A restricted method in java.lang.System has been called`, e GeneratePrefabPackages tratava essa saida como falha em configureCMakeDebug do Worklets. A mesma tarefa passou com JBR 21.0.6. Avisos de APIs obsoletas nao eram a causa deste erro.

Referencia: https://developer.android.com/build/jdks (selecao de JAVA_HOME em builds pelo terminal).
O launcher tambem ativa EVENTMAP_NATIVE_CXX_DIR com alias de unidade livre para `.cxx`, usando o plugin existente. Isso evita `Filename longer than 260 characters` no Ninja. Reutiliza alias da mesma pasta e nao substitui unidades ocupadas. EVENTMAP_NATIVE_CXX_DIR pode definir outro caminho curto. O alias nao move arquivos e permanece disponivel para o cache de builds seguintes.
Validacao da correcao: CMake do Worklets passou com JBR 21; build completo x86_64 passou com cache curto (BUILD SUCCESSFUL). A instalacao encontrou INSTALL_FAILED_INSUFFICIENT_STORAGE: /data com 420 MB livres de 5,8 GB (93% ocupado). `pm trim-caches 1G` nao liberou espaco suficiente; nenhum dado/conta foi apagado. Instalar o APK exige liberar armazenamento ou usar outro emulador.