# Welcome to your CDK TypeScript project for WooCommerce Project

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
* `npx cdk destroy` destroys the cdk deployed application

## Steps needed to run this 3-tier BooWooCommerce application

1. To deploy this application, first clone this repository
2. Create a key-pair with the name 'test2' and download it to a secure location on your laptop.
3. Next, run cdk deploy. please note that this application was created in Canada (Central) region.
4. due to some issues i encountered while developing this application, i had to create the internet gateway stack separately. Please clone it by running 'git clone https://github.com/Zaynola/WooCommerce-IGW.git' and then when in the directory you run cdk deploy.
5. when you connect to your servers through the bastion host, please confirm the user script ran as expected. if not please run the following lines below (https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-lamp-amazon-linux-2.html):

* sudo yum update -y
* sudo amazon-linux-extras install mariadb10.5 -y
* sudo amazon-linux-extras install php8.2 -y
* sudo systemctl start httpd
* sudo systemctl enable httpd
* sudo usermod -a -G apache ec2-user
* exit 
//log back in//
* chown -R ec2-user:apache /var/www
* chmod 2775 /var/www && find /var/www -type d -exec sudo chmod 2775 {} \;
* find /var/www -type f -exec sudo chmod 0664 {} \;
* sudo yum install php-mbstring php-xml -y
* sudo systemctl restart httpdphsudo systemctl restart php-fpm
* cd /var/www/html
* wget https://www.phpmyadmin.net/downloads/phpMyAdmin-latest-all-languages.tar.gz
* mkdir phpMyAdmin && tar -xvzf phpMyAdmin-latest-all-languages.tar.gz -C phpMyAdmin --strip-components 1
* rm phpMyAdmin-latest-all-languages.tar.gz
* echo "I am load balancing properly as expected" > index.html

