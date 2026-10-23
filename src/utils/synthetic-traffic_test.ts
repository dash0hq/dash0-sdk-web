import { describe, expect, it } from "vitest";
import { classifySyntheticTraffic } from "./synthetic-traffic";
import { SyntheticTrafficSettings } from "../types/synthetic-traffic";

type FakeNavigator = {
  userAgent?: string;
  webdriver?: boolean;
  userAgentData?: { brands: Array<{ brand: string; version: string }> };
};

function classify(nav: FakeNavigator, settings: SyntheticTrafficSettings = {}, global: unknown = {}) {
  return classifySyntheticTraffic(settings, nav as unknown as Navigator, global);
}

const CHROME_BRANDS = [
  { brand: "Chromium", version: "155" },
  { brand: "Google Chrome", version: "155" },
  { brand: "Not=A?Brand", version: "24" },
];

describe("classifySyntheticTraffic", () => {
  describe("bots", () => {
    const bots: Record<string, string> = {
      Googlebot:
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/130.0.6723.116 Safari/537.36",
      "Googlebot smartphone":
        "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.116 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Google Search Console":
        "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Mobile Safari/537.36 (compatible; Google-InspectionTool/1.0;)",
      "AdsBot-Google": "AdsBot-Google (+http://www.google.com/adsbot.html)",
      bingbot:
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36",
      Baiduspider: "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
      YandexBot: "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
      GPTBot: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
      "ChatGPT-User":
        "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
      "Facebook link preview": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Slack link preview": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      Twitterbot: "Twitterbot/1.0",
      Discordbot: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      AhrefsBot: "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      UptimeRobot: "Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
      Pingdom: "Pingdom.com_bot_version_1.4_(http://www.pingdom.com/)",
    };

    for (const [name, userAgent] of Object.entries(bots)) {
      it(`classifies ${name} as a bot`, () => {
        expect(classify({ userAgent })).toBe("bot");
      });
    }

    it("classifies a crawler running in headless Chrome as a bot, not a test", () => {
      expect(
        classify({
          userAgent: bots["Googlebot"],
          webdriver: true,
          userAgentData: { brands: [{ brand: "HeadlessChrome", version: "130" }] },
        })
      ).toBe("bot");
    });
  });

  describe("automated tests", () => {
    const tests: Record<string, string> = {
      "headless Chrome":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/155.0.0.0 Safari/537.36",
      Lighthouse:
        "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
      Cypress:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Cypress/13.6.0 Chrome/118.0.5993.159 Electron/27.1.3 Safari/537.36",
      WebPageTest:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PTST/240101.123456",
      GTmetrix:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 GTmetrix",
    };

    for (const [name, userAgent] of Object.entries(tests)) {
      it(`classifies ${name} as a test`, () => {
        expect(classify({ userAgent })).toBe("test");
      });
    }

    const regularChrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";

    it("classifies a browser controlled through WebDriver or the DevTools Protocol as a test", () => {
      expect(classify({ userAgent: regularChrome, webdriver: true })).toBe("test");
    });

    it("sees through an overridden user agent via the client hint brands", () => {
      expect(
        classify({
          userAgent: regularChrome,
          userAgentData: { brands: [{ brand: "HeadlessChrome", version: "155" }, ...CHROME_BRANDS] },
        })
      ).toBe("test");
    });

    it("classifies a page under test in Cypress by its global", () => {
      expect(classify({ userAgent: regularChrome }, {}, { Cypress: {} })).toBe("test");
    });

    it("classifies PhantomJS by its globals", () => {
      expect(classify({ userAgent: regularChrome }, {}, { callPhantom: () => {} })).toBe("test");
    });
  });

  describe("real users", () => {
    const browsers: Record<string, string> = {
      "Chrome on macOS":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",
      "Safari on iOS":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Firefox on Windows": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0",
      "Edge on Windows":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
      "Samsung Internet":
        "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      "an Android phone whose model name ends in bot":
        "Mozilla/5.0 (Linux; Android 10; CUBOT X30 Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36",
      "the Facebook in-app browser":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/636183405;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]",
      "the Instagram in-app browser":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone15,2; iOS 17_5; en_US; en; scale=3.00; 1179x2556; 619419498)",
      "the LinkedIn in-app browser":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.29.6820",
    };

    for (const [name, userAgent] of Object.entries(browsers)) {
      it(`does not classify ${name}`, () => {
        expect(classify({ userAgent, webdriver: false, userAgentData: { brands: CHROME_BRANDS } })).toBeUndefined();
      });
    }

    it("does not classify a browser without user agent information", () => {
      expect(classify({})).toBeUndefined();
      expect(classifySyntheticTraffic({}, undefined, undefined)).toBeUndefined();
    });
  });

  describe("customization", () => {
    const monitor = "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0 Safari/537.36 AcmeSyntheticCheck/2.1";

    it("applies additional bot patterns", () => {
      expect(classify({ userAgent: "AcmeArchiver 3" }, { botUserAgents: [/acmearchiver/i] })).toBe("bot");
    });

    it("applies additional test patterns to the user agent and the client hint brands", () => {
      expect(classify({ userAgent: monitor }, { testUserAgents: [/AcmeSyntheticCheck/] })).toBe("test");
      expect(
        classify(
          { userAgent: "Mozilla/5.0", userAgentData: { brands: [{ brand: "AcmeHeadless", version: "1" }] } },
          { testUserAgents: [/AcmeHeadless/] }
        )
      ).toBe("test");
    });

    it("lets a custom classifier decide first", () => {
      expect(classify({ userAgent: "Mozilla/5.0" }, { classify: () => "test" })).toBe("test");
      expect(classify({ userAgent: "Mozilla/5.0" }, { classify: () => "bot" })).toBe("bot");
    });

    it("lets a custom classifier mark automated traffic as human", () => {
      expect(classify({ userAgent: "Mozilla/5.0", webdriver: true }, { classify: () => "human" })).toBeUndefined();
    });

    it("falls back to the built-in rules when the custom classifier has no opinion", () => {
      expect(classify({ userAgent: "Twitterbot/1.0" }, { classify: () => undefined })).toBe("bot");
    });

    it("falls back to the built-in rules when the custom classifier throws", () => {
      const settings: SyntheticTrafficSettings = {
        classify: () => {
          throw new Error("broken");
        },
      };
      expect(classify({ userAgent: "Twitterbot/1.0" }, settings)).toBe("bot");
    });

    it("passes the navigator to the custom classifier", () => {
      const nav = { userAgent: monitor };
      let received: unknown;
      classify(nav, {
        classify: (n) => {
          received = n;
          return undefined;
        },
      });
      expect(received).toBe(nav);
    });
  });
});
