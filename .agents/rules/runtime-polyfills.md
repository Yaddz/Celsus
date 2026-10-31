# Regra Obrigatória: Preservação de Polyfills de Runtime (React Native / Hermes)

Esta regra é de cumprimento obrigatório para evitar o erro fatal de inicialização:
`[runtime not ready]: TypeError: property is not writable`

## 1. Causa Raiz do Erro
No React Native 0.88+ com Hermes e ambientes web/webview modernos, certas propriedades globais da especificação Web IDL (`performance`, `navigator`, `crypto`, `window`, etc.) são nativamente definidas no objeto global (`globalThis` / `global`) com atributo somente leitura (`writable: false` ou getter sem setter).

Quando o preâmbulo do React Native (`setUpDefaultReactNativeEnvironment` / `setUpPerformance.js`) é executado pelo Metro, ele tenta fazer uma atribuição direta:
```javascript
global.performance = new Performance();
```
Em modo strict, essa atribuição lança imediatamente:
```
TypeError: property is not writable
```

## 2. Injeção Obrigatória no Metro Bundler (`metro.config.js`)
O React Native carrega o arquivo `setup-env.js` através de `getModulesRunBeforeMainModule` **antes** que qualquer código da aplicação (`index.ts` ou `App.tsx`) seja executado.
Portanto, é **estritamente obrigatório** manter no `metro.config.js`:
```javascript
const originalGetModulesRunBeforeMainModule = config.serializer.getModulesRunBeforeMainModule;
config.serializer.getModulesRunBeforeMainModule = (entryFilePath) => {
  const polyfillPath = path.resolve(__dirname, 'src/setupPolyfills.ts');
  const modules = originalGetModulesRunBeforeMainModule
    ? originalGetModulesRunBeforeMainModule(entryFilePath)
    : [];
  return [polyfillPath, ...modules.filter((m) => m !== polyfillPath)];
};
```

## 3. Preservação de Importação em Pontos de Entrada
1. **`apps/mobile/App.tsx`:** A linha 1 **deve** ser sempre:
   ```typescript
   import './src/setupPolyfills';
   ```
2. **`apps/mobile/index.ts`:** A linha 1 **deve** ser sempre:
   ```typescript
   import './src/setupPolyfills';
   ```

## 4. Proibição Absoluta
- **NUNCA** remova ou desloque a importação de `./src/setupPolyfills` para depois de outras importações.
- **NUNCA** remova o hook `config.serializer.getModulesRunBeforeMainModule` de `apps/mobile/metro.config.js`.
- Se novas propriedades globais forem adicionadas por atualizações do React Native ou Hermes (ex: novas Web APIs), adicione-as à lista `readOnlyGlobals` em `apps/mobile/src/setupPolyfills.ts`.
