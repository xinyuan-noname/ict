import { AppRegistry } from 'react-native';
import App from './App';

const APP_NAME = 'ICTApp';

AppRegistry.registerComponent(APP_NAME, () => App);
AppRegistry.runApplication(APP_NAME, {
  rootTag: document.getElementById('root')
});