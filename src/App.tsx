import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootNavigator } from '@/navigation/RootNavigator';
import { SessionProvider } from '@/session/SessionContext';
import { ProfileProvider } from '@/profile/ProfileContext';
import { I18nProvider } from '@/i18n';

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <ProfileProvider><RootNavigator /></ProfileProvider>
          <StatusBar style="auto" />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
