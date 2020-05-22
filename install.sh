#!/bin/sh

sudo apt-get update
sudo apt-get -y install pigpio

npm install -g node-gyp

npm install --save