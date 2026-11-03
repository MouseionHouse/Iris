#pragma once

#include <QObject>
#include <QUrl>
#include <functional>

// Decides which URLs may be shown in the view, and where the others go.
class NavigationPolicy : public QObject
{
    Q_OBJECT
public:
    using Opener = std::function<bool(const QUrl &)>;

    explicit NavigationPolicy(const QString &allowedOrigin, QObject *parent = nullptr);

    // Same scheme, host and port as the allowed origin. Nothing else counts: not http:, not a
    // subdomain, not a host that merely starts with the allowed one.
    Q_INVOKABLE bool isAllowed(const QUrl &url) const;
    // The bridge (irisDesktop) is offered on the allowed origin and nowhere else.
    Q_INVOKABLE bool bridgeOffered(const QUrl &url) const;
    // Hands a URL to the default browser. Only web and mail links go out; a page cannot make the
    // shell launch other handlers (file:, custom schemes).
    Q_INVOKABLE bool openExternal(const QUrl &url);

    QString allowedOrigin() const { return m_origin; }
    void setOpener(Opener opener);

private:
    QString m_origin;
    QUrl m_originUrl;
    Opener m_opener;
};
