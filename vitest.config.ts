import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'happy-dom',
    // Fixture tests parse dozens of real last.fm pages and run alongside PNG rendering (and, at times, several
    // dev sessions rendering at once): 5 s is far too tight. This is a ceiling, not a cost.
    testTimeout: 60_000,
    environmentOptions: {
      happyDOM: {
        // Fixtures are real last.fm pages: never run their scripts or fetch their assets.
        settings: {
          disableJavaScriptEvaluation: true,
          disableJavaScriptFileLoading: true,
          disableCSSFileLoading: true,
          disableIframePageLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
});
