#!/usr/bin/env bash

npm run lint ./
if [ $? != 0 ]
  then exit 1
fi
if [ -e rpc_pid.txt ]
  then kill `cat rpc_pid.txt`
fi
nohup testrpc > /dev/null 2>&1 &
echo $! > rpc_pid.txt
truffle test
if [ $? != 0 ]
  then exit 1
fi
kill `cat rpc_pid.txt`
rm rpc_pid.txt
