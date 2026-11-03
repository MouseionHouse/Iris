#include "navigationpolicy.h"

#include <QDesktopServices>

namespace {
int effectivePort(const QUrl &url)
{
    if (url.port() != -1)
        return url.port();
    if (url.scheme() == QLatin1String("https"))
        return 443;
    if (url.scheme() == QLatin1String("http"))
        return 80;
    return -1;
}
}

NavigationPolicy::NavigationPolicy(const QString &allowedOrigin, QObject *parent)
    : QObject(parent)
    , m_origin(allowedOrigin)
    , m_originUrl(allowedOrigin)
    , m_opener([](const QUrl &url) { return QDesktopServices::openUrl(url); })
{
}

bool NavigationPolicy::isAllowed(const QUrl &url) const
{
    if (!url.isValid() || url.host().isEmpty() || !url.userInfo().isEmpty())
        return false;
    return url.scheme() == m_originUrl.scheme()
        && url.host() == m_originUrl.host()
        && effectivePort(url) == effectivePort(m_originUrl);
}

bool NavigationPolicy::bridgeOffered(const QUrl &url) const
{
    return isAllowed(url);
}

bool NavigationPolicy::openExternal(const QUrl &url)
{
    static const QStringList schemes{QStringLiteral("http"), QStringLiteral("https"), QStringLiteral("mailto")};
    if (!url.isValid() || !schemes.contains(url.scheme()))
        return false;
    return m_opener(url);
}

void NavigationPolicy::setOpener(Opener opener)
{
    m_opener = std::move(opener);
}
