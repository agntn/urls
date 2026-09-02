/**
 * Keep the suite hermetic: a host with a real provider key exported would flip provider
 * auto-selection and turn forgotten fetch stubs into live requests on a real account.
 */
delete process.env.VIRUSTOTAL_API_KEY;
delete process.env.URLSCAN_API_KEY;
