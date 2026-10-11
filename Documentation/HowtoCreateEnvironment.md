1. Start with following instructions in "Creating org Microsoft account.docx"

1. Store the passwords in a temporary file?

1. Execute c01
    1. Prepare to execute c01
        1. log into Entra ID by typing "az login" in terminal
        1. sign in with your new account and click continue
        1. select a subscription if requested
        1. in the terminal type "az account show" to see that you are logged in correctly
        1. in corp.env located in CorpSetup folder fill out Name= with your company name
        1. your corp.env file should look something like this:
            ```
            NAME=mycompany
            ```
        1. add a new line in corp.env and input the following:
            ```
            CONTACT_EMAILS=<your contact email>
            ```
        1. in variables.tf inside of "c01subscription" folder inside of "corpSetup" you will need to fill out the following variable defaults with your account info:
            - billing_account_name
            - billing_profile_name
            - invoice_section_name
            - contact_emails
        
            follow the instruction inside "How to fill out variables tf.docx" to find these values
    1. Run the following in the terminal under the directory of ZBCorpArchitecture\corpSetup:
        ``` ps
        node initCorpEnvDeploy.js --stage c01
        ```
    1. after c01 finished deploying run the following:
        ```
        az login
        ```
    1. sign in with your azure email.
    1. when the subscription selection screen pops up make sure to select the new subscription that matches the one inside of corp.env
    1. once the new subscription has be selected you should now be done with c01 stage
    1. Go to you Azure portal and on the home page find the subscriptions page
    1. on the subscriptions page select the subscription you had just created using c01
    1. from the subscription overview page go to Access control (IAM)
    1. on the top click "Add" and then "Add role assignment"
    1. on "Privileged administrator roles" search for Contributor
    1. on the members section on the "Assign access to" field select "User, group, or service principal"
    1. on the Members field click "Select members"
    1. type in 'corpDeployer' and then select it
    1. at the bottom click "Review + assign"


1. Execute c02. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c02
1. Execute c05
    1. in corp.env located in CorpSetup folder fill out DNS= with your company's DNS
    1. your corp.env should look something like this:
    ```ps
    NAME=mycompany
    DNS=mycompany.com.au
    SUBSCRIPTION_ID=123a45b6-a1bb-1234-abc1-123a4b5c6789
    ```
    1. Execute c05. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c05
    ```
    1. after the deployment finishes go to the dns zone created in azure which should have the same name as the dns in corp.env
    find the server details and give them to your company's dns provider to be stored
    1. the provider should receive something like this:
        Name server 1: ns01.example.com
        Name server 2: ns01.example.net
        Name server 3: ns01.example.org
        Name server 4: ns01.example.info
    (make sure to give the service provider your dns domain located inside of corp.env)
    1. once the domain name server details have been stored on the provider's end you are finished with executing c05

1. Execute c07
    1. Execute c07. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c07
    ```
    
1. Execute c20
    1. Follow the instructions in "How to create a Free AWS account.docx"
    1. log into AWS account by typing the following in your terminal: 
        ``` ps
        aws login
    1. select "continue with Root or IAM user"
    1. select "sign in using root user email"
    1. paste in your email address that you stored and press "Next"
    1. paste your passwords that you stored and press "Sign in"
    1. run the following in the terminal to see if you are logged in: 
        ``` ps
        aws sts get-caller-identity
        ```
    1. Run the following in the terminal:
        ``` ps
        node initCorpEnvDeploy.js --stage c20
        ```
1. Execute c21. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c21
1. Execute c25. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c25
    ```
