#pragma once

#include <QObject>

// Tells the offline page when the network is back.
class NetworkWatch : public QObject
{
    Q_OBJECT
public:
    explicit NetworkWatch(QObject *parent = nullptr);

Q_SIGNALS:
    void becameOnline();
};
