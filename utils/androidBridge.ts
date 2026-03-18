export const isAndroidApp = () => {
  return typeof window !== 'undefined' && (window as any).Android !== undefined;
};

export const notifyAndroid = (action: string, data?: any) => {
  if (isAndroidApp()) {
    try {
      const payload = data ? JSON.stringify(data) : '';
      if ((window as any).Android[action]) {
        (window as any).Android[action](payload);
      } else if ((window as any).Android.postMessage) {
        (window as any).Android.postMessage(JSON.stringify({ action, data }));
      }
    } catch (e) {
      console.error('Failed to notify Android bridge:', e);
    }
  }
};
