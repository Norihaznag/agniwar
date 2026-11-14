# Preparing agniwar for AdSense

Approval is Google's decision and cannot be guaranteed. The site includes the publisher's verification meta tag and ads.txt entry. No ad code loads by default and the transfer app remains ad-free. No consent manager is bundled.

1. Deploy to the public domain, verify ownership using the Meta tag option in AdSense, complete account tasks and request review.
2. Ensure every article is accurate, useful and maintained. Verify contact works. Review the privacy policy, terms, actual hosting and logging practices, retention and third-party services; legal text is not legal advice.
3. If approved, create a real display ad unit. Before enabling any ads, configure and test a Google-certified CMP appropriate to your audience and applicable law. Review the actual vendors and practices and update the privacy disclosure; test consent and withdrawal. The build flags do not provide consent management.
4. To enable one optional, responsive placement between sections of each guide article, set both `PUBLIC_ENABLE_ADS=true` and `PUBLIC_ADSENSE_SLOT` to the genuine numeric slot ID provided by your AdSense account. Rebuild and redeploy. Until both are configured there are no ad containers or ad requests. Do not enable Auto ads in a way that places ads on transfer or near controls. Keep ad density and accidental-click prevention under review.
5. Verify rendered placements on desktop/mobile and never click your own ads. The site can be declined even after these checks.

References: https://support.google.com/adsense/answer/7584263, https://support.google.com/adsense/answer/1346295, https://support.google.com/adsense/answer/1348695, https://support.google.com/adsense/answer/13554116.
