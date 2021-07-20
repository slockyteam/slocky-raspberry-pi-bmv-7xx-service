#!/bin/sh

sudo forever start -a -l /dev/null -c "npm start" ./
