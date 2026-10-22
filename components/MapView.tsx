import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';

export function MapView({
  html,
  style,
  mapKey,
  onMessage,
}: {
  html: string;
  style: any;
  mapKey?: number | string;
  onMessage?: (data: string) => void;
}) {
  if (Platform.OS === 'web') {
    const handleMessage = (e: MessageEvent) => {
      if (onMessage && typeof e.data === 'string') {
        onMessage(e.data);
      }
    };

    return (
      <iframe
        key={mapKey}
        srcDoc={html}
        style={{
          ...style,
          border: 'none',
          borderWidth: 0,
        }}
        sandbox="allow-scripts allow-same-origin"
        onLoad={(e) => {
          const frame = e.currentTarget as HTMLIFrameElement;
          if (frame.contentWindow) {
            frame.contentWindow.addEventListener('message', handleMessage as any);
          }
          window.addEventListener('message', handleMessage);
        }}
      />
    );
  }

  return (
    <WebView
      key={mapKey}
      source={{ html }}
      style={style}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      onMessage={(e) => {
        if (onMessage) onMessage(e.nativeEvent.data);
      }}
    />
  );
}
