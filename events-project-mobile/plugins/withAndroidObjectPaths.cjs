const { withAppBuildGradle } = require('expo/config-plugins');

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withAndroidObjectPaths(config) {
  return withAppBuildGradle(config, (result) => {
    const marker = '// EventMap: shorten CMake object paths on Windows.';
    if (result.modResults.contents.includes(marker)) return result;
    if (result.modResults.language !== 'groovy') throw new Error('EventMap Android path configuration requires Groovy.');
    const anchor = 'defaultConfig {';
    if (!result.modResults.contents.includes(anchor)) throw new Error('Android defaultConfig not found.');
    result.modResults.contents = result.modResults.contents.replace(anchor, `${anchor}\n        ${marker}\n        externalNativeBuild {\n            cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" }\n        }`);
    result.modResults.contents += '\n// EventMap: optional short native build directory on Windows.\nif (System.getenv("EVENTMAP_NATIVE_CXX_DIR")) {\n    android.externalNativeBuild.cmake.buildStagingDirectory = file(System.getenv("EVENTMAP_NATIVE_CXX_DIR"))\n}\n';
    return result;
  });
};

