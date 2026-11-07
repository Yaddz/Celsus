import './src/setupPolyfills';
import { registerRootComponent } from 'expo';

import App from './App';
import { spreadsheetImportService } from './src/services/spreadsheetImportService';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Carrega os dados da planilha na carteira AUVP uma única vez por instalação (não roda nos testes,
// que importam App diretamente). Ao terminar, o App recarrega os dados via onImported.
void spreadsheetImportService.runStartupSeedOnce();
