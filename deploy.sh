#!/bin/bash

source .env

# Check if environment variables are set and non-empty
if [ -z "$vpsuser" ] || [ -z "$vpsaddress" ] || [ -z "$mmlappdir" ]; then
  echo "Error: One or more required env variables (vpsuser, vpsaddress, mmlappdir) are not set or are empty."
  exit 1
fi

echo "Deploying to $vpsuser@$vpsaddress..."

ssh $vpsuser@$vpsaddress <<EOF
bash -l -c "
mkdir -p ${mmlappdir}
cd ${mmlappdir}
git restore .
cd ~
"
EOF

scp ./apps/3d-web-experience/server/.env ${vpsuser}@${vpsaddress}:${mmlappdir}/apps/3d-web-experience/server/.
scp ./apps/3d-web-experience/server-advanced/.env ${vpsuser}@${vpsaddress}:${mmlappdir}/apps/3d-web-experience/server-advanced/.
scp ./packages/3d-web-experience-server/.env ${vpsuser}@${vpsaddress}:${mmlappdir}/packages/3d-web-experience-server/.env
scp ./.env ${vpsuser}@${vpsaddress}:${mmlappdir}/.

ssh $vpsuser@$vpsaddress <<EOF
bash -l -c "
source ~/.bashrc
source ~/.nvm/nvm.sh

# Change to the specified application directory
if [ ! -d ${mmlappdir} ]; then
  echo 'The directory specified in mmlappdir does not exist: ${mmlappdir}'
  exit 1
fi

cd ${mmlappdir}
pwd

# Check for .nvmrc file
if [ ! -f .nvmrc ]; then
  echo '.nvmrc file not found!'
  exit 1
fi

nvm install $(cat .nvmrc)
npm install -g pm2

git pull

nvm use $(cat .nvmrc)
npm install
npm run build
pm2 delete \"mml.mgz.me\"
pm2 start npm --name \"mml.mgz.me\" -- run start
"
EOF