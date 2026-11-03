#include "networkwatch.h"

#include <QNetworkInformation>

NetworkWatch::NetworkWatch(QObject *parent)
    : QObject(parent)
{
    if (QNetworkInformation::loadBackendByFeatures(QNetworkInformation::Feature::Reachability)) {
        connect(QNetworkInformation::instance(), &QNetworkInformation::reachabilityChanged, this,
                [this](QNetworkInformation::Reachability r) {
                    if (r == QNetworkInformation::Reachability::Online)
                        Q_EMIT becameOnline();
                });
    }
}
